/**
 * Parity tests: `(payloadId, index)` resolution for cross-chain payload handlers.
 * Run: node --experimental-strip-types --test scripts/parity/crosschain-index.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findOpenPayloadCandidate,
  isPayloadRowClosed,
  isPayloadRowOpen,
  nextPayloadIndexWhenAllClosed,
  payloadIndexFromMessages,
  resolvePayloadKeyForEvent,
  type PayloadRowForIndex,
} from "../../src/helpers/crosschainIndex.ts";

const t = new Date("2024-01-01");

function payload(
  index: number,
  facts: {
    completedAt?: Date | null;
    repaidAt?: Date | null;
    preparedAt?: Date | null;
  } = {}
): PayloadRowForIndex {
  return {
    index,
    completedAt: facts.completedAt ?? null,
    repaidAt: facts.repaidAt ?? null,
    preparedAt: facts.preparedAt ?? t,
  };
}

describe("isPayloadRowOpen / closed", () => {
  it("open when completedAt is null", () => {
    assert.equal(isPayloadRowOpen(payload(0)), true);
    assert.equal(isPayloadRowClosed(payload(0)), false);
  });

  it("closed when completedAt is set", () => {
    const row = payload(0, { completedAt: t });
    assert.equal(isPayloadRowOpen(row), false);
    assert.equal(isPayloadRowClosed(row), true);
  });
});

describe("findOpenPayloadCandidate", () => {
  it("returns lowest open index", () => {
    const rows = [payload(0, { completedAt: t }), payload(1), payload(2)];
    assert.equal(findOpenPayloadCandidate(rows)?.index, 1);
  });

  it("returns null when all closed", () => {
    assert.equal(findOpenPayloadCandidate([payload(0, { completedAt: t })]), null);
  });
});

describe("nextPayloadIndexWhenAllClosed", () => {
  it("returns 0 for empty", () => {
    assert.equal(nextPayloadIndexWhenAllClosed([]), 0);
  });

  it("returns MAX+1", () => {
    assert.equal(nextPayloadIndexWhenAllClosed([payload(0), payload(2)]), 3);
  });
});

describe("payloadIndexFromMessages", () => {
  it("returns unique payloadIndex including batch-only rows", () => {
    assert.equal(
      payloadIndexFromMessages([
        { payloadIndex: 1, batchedAt: t, preparedAt: null },
        { payloadIndex: 1, batchedAt: t, preparedAt: null },
      ]),
      1
    );
  });

  it("returns null when unlinked", () => {
    assert.equal(payloadIndexFromMessages([{ payloadIndex: null }]), null);
  });
});

describe("resolvePayloadKeyForEvent", () => {
  it("mutates open row without incrementing index", () => {
    const rows = [payload(0, { repaidAt: t })];
    const key = resolvePayloadKeyForEvent("SendPayload", rows, { deferAllowed: false });
    assert.deepEqual(key, { action: "mutate", index: 0 });
  });

  it("creates at MAX+1 when all rows closed", () => {
    const rows = [payload(0, { completedAt: t }), payload(1, { completedAt: t })];
    const key = resolvePayloadKeyForEvent("UnderpaidBatch", rows, { deferAllowed: false });
    assert.deepEqual(key, { action: "create", index: 2 });
  });

  it("same-chain underpaid → send → repay stays on index 0", () => {
    let rows: PayloadRowForIndex[] = [];

    let key = resolvePayloadKeyForEvent("UnderpaidBatch", rows, { deferAllowed: false });
    assert.deepEqual(key, { action: "create", index: 0 });
    rows = [payload(0)];

    key = resolvePayloadKeyForEvent("SendPayload", rows, { deferAllowed: false });
    assert.deepEqual(key, { action: "mutate", index: 0 });
    rows = [payload(0, { repaidAt: t })];

    key = resolvePayloadKeyForEvent("RepayBatch", rows, { deferAllowed: false });
    assert.deepEqual(key, { action: "mutate", index: 0 });
  });

  it("skip-underpaid SendPayload only creates index 0", () => {
    const key = resolvePayloadKeyForEvent("SendPayload", [], { deferAllowed: false });
    assert.deepEqual(key, { action: "create", index: 0 });
  });

  it("second UnderpaidBatch same batch reuses open index", () => {
    const rows = [payload(0)];
    const key = resolvePayloadKeyForEvent("UnderpaidBatch", rows, { deferAllowed: false });
    assert.deepEqual(key, { action: "mutate", index: 0 });
  });

  it("v3 addUnpaidMessage: UnderpaidBatch creates index 0 with no prior rows", () => {
    const key = resolvePayloadKeyForEvent("UnderpaidBatch", [], { deferAllowed: false });
    assert.deepEqual(key, { action: "create", index: 0 });
  });

  it("RepayBatch defers when no open row", () => {
    const rows = [payload(0, { completedAt: t })];
    const key = resolvePayloadKeyForEvent("RepayBatch", rows, { deferAllowed: false });
    assert.deepEqual(key, { action: "defer" });
  });

  it("cross-chain mutator defers when no open row", () => {
    const key = resolvePayloadKeyForEvent("RepayBatch", [], { deferAllowed: true });
    assert.deepEqual(key, { action: "defer" });
  });

  it("uses message payloadIndex hint when row is open", () => {
    const rows = [payload(0), payload(1, { repaidAt: t })];
    const key = resolvePayloadKeyForEvent("RepayBatch", rows, {
      deferAllowed: false,
      messagePayloadIndex: 1,
    });
    assert.deepEqual(key, { action: "mutate", index: 1 });
  });

  it("HandlePayload prefers open repaid row", () => {
    const rows = [payload(0), payload(1, { repaidAt: t })];
    const key = resolvePayloadKeyForEvent("HandlePayload", rows, { deferAllowed: true });
    assert.deepEqual(key, { action: "mutate", index: 1 });
  });
});
