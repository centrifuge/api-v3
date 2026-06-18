import { describe, expect, it } from "vitest";
import {
  getMessageSendAnchorAt,
  getPayloadSendAnchorAt,
  passesCausalOrder,
  pickSendTarget,
} from "../../src/helpers/crosschainReconciliation";

const t = new Date("2024-01-01");

function msg(
  index: number,
  facts: {
    preparedAt?: Date | null;
    payloadId?: `0x${string}` | null;
    payloadIndex?: number | null;
    failedAt?: Date | null;
    executedAt?: Date | null;
  } = {}
) {
  return {
    read: () => ({
      index,
      preparedAt: facts.preparedAt ?? null,
      payloadId: facts.payloadId ?? null,
      payloadIndex: facts.payloadIndex ?? null,
      failedAt: facts.failedAt ?? null,
      executedAt: facts.executedAt ?? null,
    }),
  };
}

describe("getMessageSendAnchorAt", () => {
  it("uses payload sentAt when message is batch-linked", () => {
    const sent = new Date("2024-02-01");
    expect(
      getMessageSendAnchorAt(
        { preparedAt: null, payloadId: `0x${"aa".repeat(32)}`, payloadIndex: 0 },
        { sentAt: sent, underpaidAt: t }
      )?.getTime()
    ).toBe(sent.getTime());
  });

  it("falls back to preparedAt for unlinked messages", () => {
    const prepared = new Date("2024-03-01");
    expect(getMessageSendAnchorAt({ preparedAt: prepared })?.getTime()).toBe(prepared.getTime());
  });
});

describe("pickSendTarget", () => {
  it("returns null when no send anchor", () => {
    const rows = [msg(0, { preparedAt: null, payloadId: null })];
    expect(pickSendTarget(rows, "execute")).toBeNull();
  });

  it("execute picks lowest open row", () => {
    const rows = [msg(0, { preparedAt: t, executedAt: t }), msg(1, { preparedAt: t })];
    expect(pickSendTarget(rows, "execute")?.read().index).toBe(1);
  });

  it("execute retries failed row first", () => {
    const rows = [
      msg(0, { preparedAt: t, executedAt: t }),
      msg(1, { preparedAt: t }),
    ];
    expect(pickSendTarget(rows, "execute")?.read().index).toBe(1);
  });

  it("fail picks lowest non-executed row", () => {
    const rows = [msg(0, { preparedAt: t, failedAt: t }), msg(1, { preparedAt: t })];
    expect(pickSendTarget(rows, "fail")?.read().index).toBe(0);
  });

  it("fail returns null when all executed", () => {
    const rows = [msg(0, { preparedAt: t, executedAt: t })];
    expect(pickSendTarget(rows, "fail")).toBeNull();
  });

  it("execute returns null when all executed", () => {
    const rows = [msg(0, { preparedAt: t, executedAt: t })];
    expect(pickSendTarget(rows, "execute")).toBeNull();
  });
});

describe("passesCausalOrder", () => {
  it("rejects receive before send anchor", () => {
    const send = new Date("2024-06-02T12:00:00Z");
    const receive = new Date("2024-06-01T12:00:00Z");
    expect(passesCausalOrder(receive, send)).toBe(false);
  });

  it("accepts receive after send anchor", () => {
    const send = new Date("2024-06-01T12:00:00Z");
    const receive = new Date("2024-06-02T12:00:00Z");
    expect(passesCausalOrder(receive, send)).toBe(true);
  });
});

describe("getPayloadSendAnchorAt", () => {
  it("prefers sentAt over underpaidAt", () => {
    const sent = new Date("2024-02-01");
    const underpaid = new Date("2024-01-01");
    expect(
      getPayloadSendAnchorAt({ sentAt: sent, underpaidAt: underpaid })?.getTime()
    ).toBe(sent.getTime());
  });

  it("falls back to underpaidAt", () => {
    const underpaid = new Date("2024-01-01");
    expect(getPayloadSendAnchorAt({ sentAt: null, underpaidAt: underpaid })?.getTime()).toBe(
      underpaid.getTime()
    );
  });
});
