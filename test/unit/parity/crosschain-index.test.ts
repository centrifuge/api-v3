import { describe, expect, it } from "vitest";
import {
  isPayloadSent,
  payloadIndexFromMessages,
  pickOpenPayloadRowAmong,
  resolveHandleTargetIndex,
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
    deliveredAt?: Date | null;
  } = {}
): PayloadRowForIndex {
  return {
    index,
    completedAt: facts.completedAt ?? null,
    sentAt: facts.sentAt ?? null,
    underpaidAt: facts.underpaidAt ?? t,
    deliveredAt: facts.deliveredAt ?? null,
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

  it("new underpaid send creates a fresh index while an unsent underpaid row exists", () => {
    // Two concurrent underpaid instances of the same batch (gateway counter = 2):
    // the second send's UnderpaidBatch carries a fresh unlinked message and must
    // not merge into the first instance's still-unsent row.
    const rows = [payload(0)];
    const key = resolvePayloadKeyForEvent("UnderpaidBatch", rows, {
      deferAllowed: false,
      hasUnlinkedAwaitingMessage: true,
    });
    expect(key).toEqual({ action: "create", index: 1 });
  });

  it("new underpaid send creates a fresh index alongside completed, in-transit, and unsent rows", () => {
    // Pharos incident 2026-08: batch underpaid four times; instances 0-2 were
    // completed/sent/underpaid when the fourth UnderpaidBatch arrived. It must
    // allocate index 3 instead of merging into the unsent index-2 row.
    const rows = [payload(0, { sentAt: t, completedAt: t }), payload(1, { sentAt: t }), payload(2)];
    const key = resolvePayloadKeyForEvent("UnderpaidBatch", rows, {
      deferAllowed: false,
      hasUnlinkedAwaitingMessage: true,
    });
    expect(key).toEqual({ action: "create", index: 3 });
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

  it("HandlePayload prefers the lowest open sent row not yet delivered", () => {
    // Two instances in transit, the first already delivered (awaiting its
    // execute): the second delivery belongs to the second instance.
    const rows = [payload(0, { sentAt: t, deliveredAt: t }), payload(1, { sentAt: t })];
    const key = resolvePayloadKeyForEvent("HandlePayload", rows, { deferAllowed: true });
    expect(key).toEqual({ action: "mutate", index: 1 });
  });

  it("HandlePayload falls back to the delivered open sent row when none is undelivered", () => {
    // Proof rounds / replays for an already-delivered payload keep targeting it.
    const rows = [payload(0, { sentAt: t, deliveredAt: t })];
    const key = resolvePayloadKeyForEvent("HandlePayload", rows, { deferAllowed: true });
    expect(key).toEqual({ action: "mutate", index: 0 });
  });

  it("HandlePayload defers when no open sent row exists (unsent rows are not delivery targets)", () => {
    // An underpaid (unsent) row cannot accept a delivery: the payload was
    // not sent yet. The event defers and waits in the receive queue for the
    // send to be indexed instead of stamping deliveredAt on an unsent row.
    const rows = [payload(0), payload(1)];
    const key = resolvePayloadKeyForEvent("HandlePayload", rows, { deferAllowed: true });
    expect(key).toEqual({ action: "defer" });
  });
});

describe("resolveHandleTargetIndex", () => {
  it("returns null with no rows", () => {
    expect(
      resolveHandleTargetIndex([], { participationIndices: [], linkedMessageIndices: [] })
    ).toBeNull();
  });

  it("a unique adapter SEND participation identifies the instance", () => {
    const rows = [payload(0, { sentAt: t, completedAt: t }), payload(1, { sentAt: t })];
    expect(
      resolveHandleTargetIndex(rows, { participationIndices: [0], linkedMessageIndices: [0, 1] })
    ).toBe(0);
  });

  it("a unique message linkage identifies the instance, even onto a closed row (replay)", () => {
    const rows = [payload(0, { sentAt: t, completedAt: t })];
    expect(
      resolveHandleTargetIndex(rows, { participationIndices: [], linkedMessageIndices: [0] })
    ).toBe(0);
  });

  it("ambiguous message linkage routes FIFO instead of collapsing to the minimum index", () => {
    // Pharos staging symptom: with instance 0 completed, min-based linkage
    // pinned every later delivery onto row 0, leaving rows 1..n stuck
    // Delivered / completedAt null.
    const rows = [
      payload(0, { sentAt: t, completedAt: t }),
      payload(1, { sentAt: t }),
      payload(2, { sentAt: t }),
    ];
    expect(
      resolveHandleTargetIndex(rows, { participationIndices: [], linkedMessageIndices: [0, 1, 2] })
    ).toBe(1);
  });

  it("ambiguous adapter participation across instances also routes FIFO", () => {
    const rows = [payload(0, { sentAt: t, deliveredAt: t }), payload(1, { sentAt: t })];
    expect(
      resolveHandleTargetIndex(rows, {
        participationIndices: [0, 1],
        linkedMessageIndices: [0, 1],
      })
    ).toBe(1);
  });

  it("with every row closed, falls back to the lowest linked row (idempotent replay)", () => {
    const rows = [
      payload(0, { sentAt: t, completedAt: t }),
      payload(1, { sentAt: t, completedAt: t }),
    ];
    expect(
      resolveHandleTargetIndex(rows, { participationIndices: [], linkedMessageIndices: [0, 1] })
    ).toBe(0);
  });

  it("with every row closed and nothing linked, returns null (receive stays queued)", () => {
    const rows = [payload(0, { sentAt: t, completedAt: t })];
    expect(
      resolveHandleTargetIndex(rows, { participationIndices: [], linkedMessageIndices: [] })
    ).toBeNull();
  });

  it("a replayed delivery routes to the causally-possible delivered row, not a later unsent-yet instance", () => {
    // Row 0 delivered (awaiting execute), row 1 sent later. A replay of row
    // 0's delivery (receivedAt before row 1's send) must land idempotently on
    // row 0: routing it to row 1 would fail the caller's causal-order check
    // and strand the entry in the receive queue.
    const t5 = new Date("2024-01-01T00:05:00Z");
    const t8 = new Date("2024-01-01T00:08:00Z");
    const t10 = new Date("2024-01-01T00:10:00Z");
    const rows = [payload(0, { sentAt: t5, deliveredAt: t8 }), payload(1, { sentAt: t10 })];
    expect(
      resolveHandleTargetIndex(rows, {
        participationIndices: [],
        linkedMessageIndices: [0, 1],
        receivedAt: t8,
      })
    ).toBe(0);
  });

  it("a genuine later delivery still routes FIFO to the undelivered instance", () => {
    const t5 = new Date("2024-01-01T00:05:00Z");
    const t8 = new Date("2024-01-01T00:08:00Z");
    const t10 = new Date("2024-01-01T00:10:00Z");
    const t12 = new Date("2024-01-01T00:12:00Z");
    const rows = [payload(0, { sentAt: t5, deliveredAt: t8 }), payload(1, { sentAt: t10 })];
    expect(
      resolveHandleTargetIndex(rows, {
        participationIndices: [],
        linkedMessageIndices: [0, 1],
        receivedAt: t12,
      })
    ).toBe(1);
  });

  it("with no sent rows and ambiguous linkage, returns null so the receive queues until a send is indexed", () => {
    // Both rows are underpaid and unsent. A handle cannot belong to a
    // not-yet-sent instance, so resolveHandleTargetIndex returns null and
    // tryApplyPayloadReceive leaves the entry in the receive queue until a
    // sent row exists (instead of stamping deliveredAt on an unsent row).
    const rows = [payload(0), payload(1)];
    expect(
      resolveHandleTargetIndex(rows, {
        participationIndices: [],
        linkedMessageIndices: [0, 1],
        receivedAt: t,
      })
    ).toBeNull();
  });

  it("a unique participation or linkage pointing only at an unsent row returns null", () => {
    // Single underpaid instance: the unique hints identify index 0, but the
    // row was never sent, so the handle must queue rather than stamp
    // deliveredAt on it.
    const rows = [payload(0)];
    expect(
      resolveHandleTargetIndex(rows, { participationIndices: [0], linkedMessageIndices: [0] })
    ).toBeNull();
  });
});
