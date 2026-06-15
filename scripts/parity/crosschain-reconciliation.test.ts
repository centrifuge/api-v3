/**
 * Parity tests: new reconcile helpers vs origin/main omnichain handler semantics.
 * Run: node --experimental-strip-types --test scripts/parity/crosschain-reconciliation.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMessageSendAnchorAt,
  getPayloadSendAnchorAt,
  passesCausalOrder,
  pickSendTarget,
  sortMessageQueueFifo,
  type MessageRowRef,
} from "../../src/helpers/crosschainReconciliationCore.ts";

/** Minimal row stub for pickSendTarget tests. */
function msg(
  index: number,
  facts: {
    preparedAt?: Date | null;
    batchedAt?: Date | null;
    repaidAt?: Date | null;
    failedAt?: Date | null;
    executedAt?: Date | null;
  }
): MessageRowRef {
  return {
    read: () => ({
      index,
      preparedAt: facts.preparedAt ?? null,
      batchedAt: facts.batchedAt ?? null,
      repaidAt: facts.repaidAt ?? null,
      failedAt: facts.failedAt ?? null,
      executedAt: facts.executedAt ?? null,
    }),
  } as MessageRowRef;
}

/** Mirrors main `getFromAwaitingBatchDeliveryOrFailedQueue` index pick (lowest qualifying). */
function mainPickExecuteOrFail(
  rows: MessageRowRef[],
  status: "execute" | "fail"
): MessageRowRef | null {
  const qualifying = rows
    .filter((r) => {
      const d = r.read();
      const awaiting = d.executedAt == null && d.failedAt == null;
      const failed = d.failedAt != null && d.executedAt == null;
      return awaiting || failed;
    })
    .sort((a, b) => a.read().index - b.read().index);
  if (qualifying.length === 0) return null;
  const target = qualifying[0]!;
  if (status === "fail" && target.read().failedAt != null) return null;
  return target;
}

describe("getMessageSendAnchorAt", () => {
  it("uses repaidAt for batch-only rows (RepayBatch path)", () => {
    const repaid = new Date("2024-06-01T12:00:00Z");
    const batched = new Date("2024-06-01T11:00:00Z");
    assert.equal(
      getMessageSendAnchorAt({ preparedAt: null, batchedAt: batched, repaidAt: repaid })?.getTime(),
      repaid.getTime()
    );
  });

  it("falls back to batchedAt then preparedAt", () => {
    const batched = new Date("2024-06-01T11:00:00Z");
    const prepared = new Date("2024-06-01T10:00:00Z");
    assert.equal(
      getMessageSendAnchorAt({ preparedAt: prepared, batchedAt: batched, repaidAt: null })?.getTime(),
      batched.getTime()
    );
    assert.equal(getMessageSendAnchorAt({ preparedAt: prepared })?.getTime(), prepared.getTime());
  });
});

describe("pickSendTarget vs main omnichain queue", () => {
  const t = new Date("2024-01-01");

  it("execute: single awaiting row", () => {
    const rows = [msg(0, { preparedAt: t })];
    assert.equal(pickSendTarget(rows, "execute")?.read().index, 0);
    assert.equal(mainPickExecuteOrFail(rows, "execute")?.read().index, 0);
  });

  it("execute: retry after fail picks lowest failed index", () => {
    const rows = [msg(0, { preparedAt: t, failedAt: t }), msg(1, { preparedAt: t })];
    assert.equal(pickSendTarget(rows, "execute")?.read().index, 0);
    assert.equal(mainPickExecuteOrFail(rows, "execute")?.read().index, 0);
  });

  it("execute: after success picks lowest open awaiting", () => {
    const rows = [
      msg(0, { preparedAt: t, executedAt: t }),
      msg(1, { preparedAt: t }),
    ];
    assert.equal(pickSendTarget(rows, "execute")?.read().index, 1);
    assert.equal(mainPickExecuteOrFail(rows, "execute")?.read().index, 1);
  });

  it("fail: picks lowest non-executed row", () => {
    const rows = [msg(0, { preparedAt: t, failedAt: t }), msg(1, { preparedAt: t })];
    assert.equal(pickSendTarget(rows, "fail")?.read().index, 0);
    assert.equal(mainPickExecuteOrFail(rows, "fail"), null);
  });

  it("fail: awaiting only", () => {
    const rows = [msg(0, { preparedAt: t })];
    assert.equal(pickSendTarget(rows, "fail")?.read().index, 0);
    assert.equal(mainPickExecuteOrFail(rows, "fail")?.read().index, 0);
  });

  it("excludes rows without send anchor (receive-before-send queues)", () => {
    const rows = [msg(0, { preparedAt: null, batchedAt: null, repaidAt: null })];
    assert.equal(pickSendTarget(rows, "execute"), null);
  });
});

describe("passesCausalOrder", () => {
  it("allows equal timestamps (omnichain cross-chain same-second blocks)", () => {
    const t = new Date("2024-01-01T12:00:00Z");
    assert.equal(passesCausalOrder(t, t), true);
  });

  it("requires receive not before send anchor", () => {
    const send = new Date("2024-01-01T12:00:00Z");
    const recv = new Date("2024-01-01T12:00:01Z");
    assert.equal(passesCausalOrder(recv, send), true);
    assert.equal(passesCausalOrder(send, recv), false);
  });
});

describe("sortMessageQueueFifo", () => {
  it("orders fail before execute at equal timestamp", () => {
    const t = new Date("2024-01-01");
    const sorted = sortMessageQueueFifo([
      {
        source: "incoming",
        status: "execute",
        messageId: "0x01",
        hash: "0x01",
        fromCentrifugeId: "1",
        toCentrifugeId: "2",
        rawData: "0x",
        receivedAt: t,
        receivedAtBlock: 100,
        receivedAtChainId: 1,
        receivedAtTxHash: "0xab",
      },
      {
        source: "incoming",
        status: "fail",
        messageId: "0x01",
        hash: "0x01",
        fromCentrifugeId: "1",
        toCentrifugeId: "2",
        rawData: "0x",
        receivedAt: t,
        receivedAtBlock: 101,
        receivedAtChainId: 1,
        receivedAtTxHash: "0xcd",
      },
    ]);
    assert.equal(sorted[0]?.status, "fail");
  });
});

describe("getPayloadSendAnchorAt", () => {
  it("prefers repaidAt over preparedAt", () => {
    const repaid = new Date("2024-06-02");
    const prepared = new Date("2024-06-01");
    assert.equal(
      getPayloadSendAnchorAt({ preparedAt: prepared, repaidAt: repaid })?.getTime(),
      repaid.getTime()
    );
  });
});
