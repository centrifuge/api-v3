import { describe, expect, it } from "vitest";
import {
  isPayloadSent,
  payloadIndexFromMessages,
  pickOpenPayloadRowAmong,
  resolvePayloadKeyForEvent,
  type PayloadRowForIndex,
} from "../../../src/services/CrosschainPayloadService";

const t = new Date("2024-01-01");

function payload(
  index: number,
  facts: {
    completedAt?: Date | null;
    sentAt?: Date | null;
    underpaidAt?: Date | null;
  } = {}
): PayloadRowForIndex {
  return {
    index,
    completedAt: facts.completedAt ?? null,
    sentAt: facts.sentAt ?? null,
    underpaidAt: facts.underpaidAt ?? t,
  };
}

function isPayloadRowClosed(row: PayloadRowForIndex): boolean {
  return row.completedAt != null;
}

function isPayloadRowOpen(row: PayloadRowForIndex): boolean {
  return !isPayloadRowClosed(row);
}

function nextPayloadIndex(rows: PayloadRowForIndex[]): number {
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => r.index)) + 1;
}

describe("isPayloadRowOpen / closed", () => {
  it("open when completedAt is null", () => {
    expect(isPayloadRowOpen(payload(0))).toBe(true);
    expect(isPayloadRowClosed(payload(0))).toBe(false);
  });

  it("closed when completedAt is set", () => {
    const row = payload(0, { completedAt: t });
    expect(isPayloadRowOpen(row)).toBe(false);
    expect(isPayloadRowClosed(row)).toBe(true);
  });
});

describe("isPayloadSent", () => {
  it("true when sentAt is set", () => {
    expect(isPayloadSent(payload(0, { sentAt: t }))).toBe(true);
  });

  it("false when only underpaidAt is set", () => {
    expect(isPayloadSent(payload(0))).toBe(false);
  });
});

describe("pickOpenPayloadRowAmong", () => {
  it("returns lowest open index", () => {
    const rows = [payload(0, { completedAt: t }), payload(1), payload(2)];
    expect(pickOpenPayloadRowAmong(rows)?.index).toBe(1);
  });

  it("returns null when all closed", () => {
    expect(pickOpenPayloadRowAmong([payload(0, { completedAt: t })])).toBeNull();
  });
});

describe("nextPayloadIndex", () => {
  it("returns 0 for empty", () => {
    expect(nextPayloadIndex([])).toBe(0);
  });

  it("returns MAX+1", () => {
    expect(nextPayloadIndex([payload(0), payload(2)])).toBe(3);
  });
});

describe("payloadIndexFromMessages", () => {
  it("returns unique payloadIndex from linked rows", () => {
    expect(
      payloadIndexFromMessages([
        { payloadIndex: 1, payloadId: `0x${"aa".repeat(32)}` },
        { payloadIndex: 1, payloadId: `0x${"aa".repeat(32)}` },
      ])
    ).toBe(1);
  });

  it("returns null when unlinked", () => {
    expect(payloadIndexFromMessages([{ payloadIndex: null }])).toBeNull();
  });
});

describe("resolvePayloadKeyForEvent", () => {
  it("mutates open unsent row for SendPayload", () => {
    const rows = [payload(0)];
    const key = resolvePayloadKeyForEvent("SendPayload", rows, { deferAllowed: false });
    expect(key).toEqual({ action: "mutate", index: 0 });
  });

  it("defers late UnderpaidBatch when highest row has sentAt", () => {
    const rows = [payload(0, { sentAt: t, completedAt: t })];
    const key = resolvePayloadKeyForEvent("UnderpaidBatch", rows, { deferAllowed: false });
    expect(key).toEqual({ action: "defer" });
  });

  it("mutates lowest unsent row for UnderpaidBatch", () => {
    const rows = [payload(0), payload(1, { sentAt: t })];
    const key = resolvePayloadKeyForEvent("UnderpaidBatch", rows, { deferAllowed: false });
    expect(key).toEqual({ action: "mutate", index: 0 });
  });

  it("replayed UnderpaidBatch (no unlinked message) reuses the closed hinted row", () => {
    // Late duplicate of an already-linked batch: no freshly prepared unlinked
    // message exists, so the messagePayloadIndex hint legitimately reuses the
    // existing (possibly terminal) row instead of allocating a new index.
    const rows = [payload(0, { completedAt: t })];
    const key = resolvePayloadKeyForEvent("UnderpaidBatch", rows, {
      deferAllowed: false,
      messagePayloadIndex: 0,
      hasUnlinkedAwaitingMessage: false,
    });
    expect(key).toEqual({ action: "mutate", index: 0 });
  });

  it("SendPayload creates next index when all rows closed and defer disallowed", () => {
    const rows = [payload(0, { completedAt: t })];
    const key = resolvePayloadKeyForEvent("SendPayload", rows, { deferAllowed: false });
    expect(key).toEqual({ action: "create", index: 1 });
  });

  it("same-chain underpaid → send stays on index 0", () => {
    let rows: PayloadRowForIndex[] = [];

    let key = resolvePayloadKeyForEvent("UnderpaidBatch", rows, { deferAllowed: false });
    expect(key).toEqual({ action: "create", index: 0 });
    rows = [payload(0)];

    key = resolvePayloadKeyForEvent("SendPayload", rows, { deferAllowed: false });
    expect(key).toEqual({ action: "mutate", index: 0 });
    rows = [payload(0, { sentAt: t })];

    key = resolvePayloadKeyForEvent("RepayBatch", rows, { deferAllowed: false });
    expect(key).toEqual({ action: "mutate", index: 0 });
  });

  it("skip-underpaid SendPayload only creates index 0", () => {
    const key = resolvePayloadKeyForEvent("SendPayload", [], { deferAllowed: false });
    expect(key).toEqual({ action: "create", index: 0 });
  });

  it("second UnderpaidBatch same batch reuses unsent index", () => {
    const rows = [payload(0)];
    const key = resolvePayloadKeyForEvent("UnderpaidBatch", rows, { deferAllowed: false });
    expect(key).toEqual({ action: "mutate", index: 0 });
  });

  it("v3 addUnpaidMessage: UnderpaidBatch creates index 0 with no prior rows", () => {
    const key = resolvePayloadKeyForEvent("UnderpaidBatch", [], { deferAllowed: false });
    expect(key).toEqual({ action: "create", index: 0 });
  });

  it("RepayBatch defers when no open row", () => {
    const rows = [payload(0, { completedAt: t })];
    const key = resolvePayloadKeyForEvent("RepayBatch", rows, { deferAllowed: false });
    expect(key).toEqual({ action: "defer" });
  });

  it("cross-chain mutator defers when no open row", () => {
    const key = resolvePayloadKeyForEvent("RepayBatch", [], { deferAllowed: true });
    expect(key).toEqual({ action: "defer" });
  });

  it("uses message payloadIndex hint when the hinted open row is the only candidate", () => {
    const rows = [payload(0, { completedAt: t }), payload(1, { sentAt: t })];
    const key = resolvePayloadKeyForEvent("RepayBatch", rows, {
      deferAllowed: false,
      messagePayloadIndex: 1,
    });
    expect(key).toEqual({ action: "mutate", index: 1 });
  });

  it("RepayBatch ignores a hint pointing at a sent row when an open unsent row awaits its repay", () => {
    // PR #465 review Gap A: a repay always targets an underpaid (unsent)
    // instance - the min-based hint must not route it onto the older
    // in-transit row.
    const rows = [payload(0), payload(1, { sentAt: t })];
    const key = resolvePayloadKeyForEvent("RepayBatch", rows, {
      deferAllowed: false,
      messagePayloadIndex: 1,
    });
    expect(key).toEqual({ action: "mutate", index: 0 });
  });

  it("RepayBatch follows the row sent by the current tx even when an unsent row exists", () => {
    // Same-tx rule: Gateway.repay emits RepayBatch after _send, so the repaid
    // row already carries this tx's hash and beats the prefer-unsent fallback.
    const txHash = `0x${"cd".repeat(32)}` as const;
    const rows = [payload(0), { ...payload(1, { sentAt: t }), sentAtTxHash: txHash }];
    const key = resolvePayloadKeyForEvent("RepayBatch", rows, {
      deferAllowed: false,
      messagePayloadIndex: 1,
      currentTxHash: txHash,
    });
    expect(key).toEqual({ action: "mutate", index: 1 });
  });

  it("SendPayload ignores a hint pointing at a sent open row when an open unsent row exists", () => {
    // PR #465 review Gap A (send half): the repay-send of the underpaid
    // instance must stamp sentAt on the unsent row, not no-op on row 0.
    const rows = [payload(1), payload(0, { sentAt: t })];
    const key = resolvePayloadKeyForEvent("SendPayload", rows, {
      deferAllowed: false,
      messagePayloadIndex: 0,
    });
    expect(key).toEqual({ action: "mutate", index: 1 });
  });

  it("SendPayload mutates the row it sent in the same tx (adapter proof round)", () => {
    // PR #465 review Gap B: adapter #2's SendPayload in the same tx must not
    // stamp sentAt on a pending underpaid row the hint points at.
    const txHash = `0x${"ef".repeat(32)}` as const;
    const rows = [payload(0), { ...payload(1, { sentAt: t }), sentAtTxHash: txHash }];
    const key = resolvePayloadKeyForEvent("SendPayload", rows, {
      deferAllowed: false,
      messagePayloadIndex: 0,
      currentTxHash: txHash,
    });
    expect(key).toEqual({ action: "mutate", index: 1 });
  });

  it("HandlePayload prefers open sent row", () => {
    const rows = [payload(0), payload(1, { sentAt: t })];
    const key = resolvePayloadKeyForEvent("HandlePayload", rows, { deferAllowed: true });
    expect(key).toEqual({ action: "mutate", index: 1 });
  });
});
