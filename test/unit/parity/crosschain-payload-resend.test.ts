import { describe, expect, it } from "vitest";
import {
  hasUnlinkedAwaitingMessage,
  payloadIndexFromMessages,
  resolvePayloadKeyForEvent,
  type PayloadEventKind,
  type PayloadRowForIndex,
  type ResolvePayloadKeyResult,
} from "../../../src/services/CrosschainPayloadService";

/**
 * Regression coverage for repeated identical crosschain sends (same batch bytes
 * => same payloadId / messageId). Observed on Avalanche mainnet tx
 * 0xea262a48..., block 91614644 (log order: PrepareMessage then UnderpaidBatch,
 * SendPayload arrives in a later relayer tx after RepayBatch).
 *
 * Methodology: `resolvePayloadKeyForEvent` inputs are NEVER hand-set. Each
 * scenario simulates the exact handler sequence (PrepareMessage duplicate
 * guard, UnderpaidBatch linking, SendPayload linkMessagesToPayload, RepayBatch,
 * destination execute/complete) and derives `messagePayloadIndex` via
 * `payloadIndexFromMessages` and the new-send signal via
 * `hasUnlinkedAwaitingMessage` from the simulated message rows - exactly like
 * `CrosschainPayloadService.resolvePayloadKey` does. This guarantees every
 * tested input combination is reachable in production.
 *
 * Two distinct issues are covered:
 *  - Issue 1 (UnderpaidBatch): a new identical send after the prior payload is
 *    sent/completed must allocate a new payload index. Signal: PrepareMessage
 *    created a fresh unlinked AwaitingBatchDelivery message.
 *  - Issue 2 (SendPayload after RepayBatch): by then UnderpaidBatch has already
 *    linked the new message, so the signal is false and the min-based
 *    `payloadIndexFromMessages` hint points at the OLD completed row. The send
 *    must mutate the open unsent row, not the hinted completed row.
 */

const PAYLOAD_ID = `0x${"ab".repeat(32)}` as const;

const T0 = new Date("2026-07-30T17:00:00Z");
/** Monotonic clock for scenario steps. */
function ts(minutes: number): Date {
  return new Date(T0.getTime() + minutes * 60_000);
}

type SimMessage = {
  index: number;
  status: "AwaitingBatchDelivery" | "Executed" | "Failed";
  payloadId: `0x${string}` | null;
  payloadIndex: number | null;
  preparedAt: Date | null;
};

type SimRow = Required<PayloadRowForIndex>;

/**
 * Minimal source-side simulation of the crosschain handlers for a single
 * repeated one-message batch. Mirrors:
 * - gateway:PrepareMessage duplicate guard (skip when an unlinked awaiting
 *   message exists) and message row creation,
 * - gateway:UnderpaidBatch (resolve key, link first unlinked awaiting message,
 *   upsert underpaidAt),
 * - multiAdapter:SendPayload (resolve key, linkMessagesToPayload = link lowest
 *   unlinked prepared message, upsert sentAt),
 * - gateway:RepayBatch (resolve key only, no timestamp facts),
 * - destination execution (lowest awaiting message -> Executed; rows whose
 *   linked messages are all Executed get deliveredAt/completedAt).
 * Timestamp upserts use COALESCE semantics (existing value wins).
 */
class SendSim {
  readonly msgs: SimMessage[] = [];
  readonly rows: SimRow[] = [];

  /** Derives resolvePayloadKey inputs from state, like the real service does. */
  resolve(eventKind: PayloadEventKind, deferAllowed = false): ResolvePayloadKeyResult {
    return resolvePayloadKeyForEvent(eventKind, this.rows, {
      deferAllowed,
      messagePayloadIndex: payloadIndexFromMessages(this.msgs),
      hasUnlinkedAwaitingMessage: hasUnlinkedAwaitingMessage(this.msgs),
    });
  }

  /** gateway:PrepareMessage - duplicate guard, then insert unlinked message. */
  prepareMessage(at: Date): "created" | "skipped" {
    const dup = this.msgs.some(
      (m) => m.status === "AwaitingBatchDelivery" && m.payloadId == null
    );
    if (dup) return "skipped";
    this.msgs.push({
      index: this.msgs.length,
      status: "AwaitingBatchDelivery",
      payloadId: null,
      payloadIndex: null,
      preparedAt: at,
    });
    return "created";
  }

  /** gateway:UnderpaidBatch - resolve, link first unlinked awaiting, underpaidAt. */
  underpaidBatch(at: Date): ResolvePayloadKeyResult {
    const key = this.resolve("UnderpaidBatch");
    if (key.action === "defer") return key;
    const pending = this.msgs.find(
      (m) => m.status === "AwaitingBatchDelivery" && m.payloadId == null && m.preparedAt != null
    );
    if (pending) {
      pending.payloadId = PAYLOAD_ID;
      pending.payloadIndex = key.index;
    }
    this.upsertRow(key, { underpaidAt: at });
    return key;
  }

  /** gateway:RepayBatch - resolve only (facts carry no lifecycle timestamp). */
  repayBatch(): ResolvePayloadKeyResult {
    return this.resolve("RepayBatch");
  }

  /** multiAdapter:SendPayload - resolve, link lowest unlinked message, sentAt. */
  sendPayload(at: Date): ResolvePayloadKeyResult {
    const key = this.resolve("SendPayload");
    if (key.action === "defer") return key;
    const unlinked = this.msgs
      .filter((m) => m.payloadId == null && m.payloadIndex == null && m.preparedAt != null)
      .sort((a, b) => a.index - b.index)[0];
    if (unlinked) {
      unlinked.payloadId = PAYLOAD_ID;
      unlinked.payloadIndex = key.index;
    }
    this.upsertRow(key, { sentAt: at });
    return key;
  }

  /** Destination side: execute lowest awaiting message, complete finished rows. */
  destExecuteAndComplete(at: Date): void {
    const next = this.msgs
      .filter((m) => m.status === "AwaitingBatchDelivery")
      .sort((a, b) => a.index - b.index)[0];
    if (next) next.status = "Executed";
    for (const row of this.rows) {
      const linked = this.msgs.filter((m) => m.payloadIndex === row.index);
      if (linked.length > 0 && linked.every((m) => m.status === "Executed")) {
        row.deliveredAt ??= at;
        row.completedAt ??= at;
      }
    }
  }

  /** Applies a resolved key with COALESCE timestamp semantics. */
  private upsertRow(
    key: Extract<ResolvePayloadKeyResult, { action: "mutate" | "create" }>,
    facts: Partial<Pick<SimRow, "underpaidAt" | "sentAt">>
  ): void {
    if (key.action === "create") {
      this.rows.push({
        index: key.index,
        underpaidAt: facts.underpaidAt ?? null,
        sentAt: facts.sentAt ?? null,
        deliveredAt: null,
        partiallyFailedAt: null,
        completedAt: null,
      });
      return;
    }
    const row = this.rows.find((r) => r.index === key.index);
    if (!row) throw new Error(`mutate on missing row index ${key.index}`);
    if (facts.underpaidAt) row.underpaidAt ??= facts.underpaidAt;
    if (facts.sentAt) row.sentAt ??= facts.sentAt;
  }
}

describe("hasUnlinkedAwaitingMessage", () => {
  it("returns true when a freshly prepared message is not yet linked to a payload", () => {
    expect(
      hasUnlinkedAwaitingMessage([
        { payloadIndex: 0, payloadId: PAYLOAD_ID, status: "Executed", preparedAt: ts(0) },
        { payloadIndex: null, payloadId: null, status: "AwaitingBatchDelivery", preparedAt: ts(60) },
      ])
    ).toBe(true);
  });

  it("returns false when every message is already linked to a payload", () => {
    expect(
      hasUnlinkedAwaitingMessage([
        { payloadIndex: 0, payloadId: PAYLOAD_ID, status: "AwaitingBatchDelivery", preparedAt: ts(0) },
      ])
    ).toBe(false);
  });

  it("returns false when the unlinked message was already executed", () => {
    expect(
      hasUnlinkedAwaitingMessage([
        { payloadIndex: null, payloadId: null, status: "Executed", preparedAt: ts(0) },
      ])
    ).toBe(false);
  });

  it("returns false when the awaiting message was never prepared (no preparedAt)", () => {
    expect(
      hasUnlinkedAwaitingMessage([
        { payloadIndex: null, payloadId: null, status: "AwaitingBatchDelivery", preparedAt: null },
      ])
    ).toBe(false);
  });
});

describe("scenario: first send of a batch (baseline flows)", () => {
  it("a paid send creates payload index 0 and completes after destination execution", () => {
    const sim = new SendSim();
    expect(sim.prepareMessage(ts(0))).toBe("created");
    expect(sim.sendPayload(ts(0))).toEqual({ action: "create", index: 0 });
    sim.destExecuteAndComplete(ts(10));
    expect(sim.rows[0]!.completedAt).not.toBeNull();
    expect(sim.msgs[0]!.payloadIndex).toBe(0);
  });

  it("an underpaid send stays on payload index 0 through underpaid, repay, and send", () => {
    const sim = new SendSim();
    expect(sim.prepareMessage(ts(0))).toBe("created");
    expect(sim.underpaidBatch(ts(0))).toEqual({ action: "create", index: 0 });
    expect(sim.repayBatch()).toEqual({ action: "mutate", index: 0 });
    expect(sim.sendPayload(ts(5))).toEqual({ action: "mutate", index: 0 });
    sim.destExecuteAndComplete(ts(10));
    expect(sim.rows).toHaveLength(1);
    expect(sim.rows[0]!.completedAt).not.toBeNull();
  });
});

describe("scenario: identical batch sent again after the first payload completed", () => {
  /** Runs one full underpaid send cycle to completion. */
  function completeUnderpaidCycle(sim: SendSim, startMin: number): void {
    sim.prepareMessage(ts(startMin));
    sim.underpaidBatch(ts(startMin));
    sim.repayBatch();
    sim.sendPayload(ts(startMin + 5));
    sim.destExecuteAndComplete(ts(startMin + 10));
  }

  it("UnderpaidBatch of the resend creates payload index 1 instead of mutating the completed row (Avalanche bug tx)", () => {
    const sim = new SendSim();
    completeUnderpaidCycle(sim, 0);

    // Second identical requestRedeem: PrepareMessage passes the duplicate
    // guard (msg 0 is Executed) and creates msg 1 unlinked.
    expect(sim.prepareMessage(ts(60))).toBe("created");
    expect(sim.underpaidBatch(ts(60))).toEqual({ action: "create", index: 1 });
    expect(sim.msgs[1]!.payloadIndex).toBe(1);
    expect(sim.rows).toHaveLength(2);
    // The completed row is untouched.
    expect(sim.rows[0]!.completedAt).not.toBeNull();
  });

  it("SendPayload after RepayBatch mutates the new unsent row 1, even though the message hint points at completed row 0", () => {
    const sim = new SendSim();
    completeUnderpaidCycle(sim, 0);

    sim.prepareMessage(ts(60));
    sim.underpaidBatch(ts(60));
    // At this point msg 1 is linked to index 1 -> the new-send signal is
    // false and payloadIndexFromMessages returns min(0, 1) = 0 (the stale,
    // completed row). Realistic post-RepayBatch state.
    expect(hasUnlinkedAwaitingMessage(sim.msgs)).toBe(false);
    expect(payloadIndexFromMessages(sim.msgs)).toBe(0);

    expect(sim.repayBatch()).toEqual({ action: "mutate", index: 1 });
    expect(sim.sendPayload(ts(65))).toEqual({ action: "mutate", index: 1 });
    expect(sim.rows[1]!.sentAt).not.toBeNull();
    // Completed row 0 keeps its original timestamps.
    expect(sim.rows[0]!.sentAt).toEqual(ts(5));
  });

  it("a paid resend creates payload index 1 in the same transaction as its PrepareMessage", () => {
    const sim = new SendSim();
    completeUnderpaidCycle(sim, 0);

    // Paid path: SendPayload fires in the same tx as PrepareMessage, before
    // anything links msg 1 -> the new-send signal is true.
    expect(sim.prepareMessage(ts(60))).toBe("created");
    expect(hasUnlinkedAwaitingMessage(sim.msgs)).toBe(true);
    expect(sim.sendPayload(ts(60))).toEqual({ action: "create", index: 1 });
    expect(sim.msgs[1]!.payloadIndex).toBe(1);
  });

  it("a third identical resend creates payload index 2", () => {
    const sim = new SendSim();
    completeUnderpaidCycle(sim, 0);
    completeUnderpaidCycle(sim, 60);
    expect(sim.rows).toHaveLength(2);

    expect(sim.prepareMessage(ts(120))).toBe("created");
    expect(sim.underpaidBatch(ts(120))).toEqual({ action: "create", index: 2 });
  });

  it("a resend while the prior payload is still in transit creates a new index", () => {
    const sim = new SendSim();
    sim.prepareMessage(ts(0));
    sim.underpaidBatch(ts(0));
    sim.repayBatch();
    sim.sendPayload(ts(5));
    // No destination execution yet: row 0 is InTransit, msg 0 still awaiting.

    // PrepareMessage guard passes: msg 0 is awaiting but LINKED.
    expect(sim.prepareMessage(ts(20))).toBe("created");
    expect(sim.underpaidBatch(ts(20))).toEqual({ action: "create", index: 1 });
  });
});

describe("scenario: the same batch is underpaid twice before any repay", () => {
  it("the second UnderpaidBatch reuses the pending unsent row instead of creating a duplicate", () => {
    const sim = new SendSim();
    sim.prepareMessage(ts(0));
    expect(sim.underpaidBatch(ts(0))).toEqual({ action: "create", index: 0 });

    // Second identical send, also underpaid, before any repay. msg 0 is
    // awaiting but linked -> guard passes, msg 1 created unlinked.
    expect(sim.prepareMessage(ts(10))).toBe("created");
    expect(sim.underpaidBatch(ts(10))).toEqual({ action: "mutate", index: 0 });
    // Both messages end up on the single pending row.
    expect(sim.msgs[0]!.payloadIndex).toBe(0);
    expect(sim.msgs[1]!.payloadIndex).toBe(0);
    expect(sim.rows).toHaveLength(1);
  });
});

describe("scenario: multiple adapters emit SendPayload for the same send (proof rounds)", () => {
  it("the second adapter's SendPayload mutates the same in-transit row", () => {
    const sim = new SendSim();
    sim.prepareMessage(ts(0));
    sim.underpaidBatch(ts(0));
    sim.repayBatch();
    expect(sim.sendPayload(ts(5))).toEqual({ action: "mutate", index: 0 });
    // Second adapter's SendPayload in the same tx: message already linked.
    expect(sim.sendPayload(ts(5))).toEqual({ action: "mutate", index: 0 });
    expect(sim.rows).toHaveLength(1);
  });
});

describe("scenario: a paid send happens while an underpaid instance is still pending", () => {
  it("the paid send creates a new index and leaves the underpaid row waiting for its own repay", () => {
    const sim = new SendSim();
    sim.prepareMessage(ts(0));
    expect(sim.underpaidBatch(ts(0))).toEqual({ action: "create", index: 0 });

    // Second identical send with enough gas: goes straight out via
    // multiAdapter in the same tx as its PrepareMessage.
    expect(sim.prepareMessage(ts(10))).toBe("created");
    expect(hasUnlinkedAwaitingMessage(sim.msgs)).toBe(true);
    expect(sim.sendPayload(ts(10))).toEqual({ action: "create", index: 1 });
    // Pending underpaid instance keeps waiting for its own repay + send.
    expect(sim.rows[0]!.sentAt).toBeNull();

    expect(sim.repayBatch()).toEqual({ action: "mutate", index: 0 });
    expect(sim.sendPayload(ts(20))).toEqual({ action: "mutate", index: 0 });
  });
});

describe("defensive fallbacks for replayed events (states unreachable in the normal flow)", () => {
  const completedRow: PayloadRowForIndex = {
    index: 0,
    underpaidAt: ts(0),
    sentAt: ts(5),
    deliveredAt: ts(10),
    partiallyFailedAt: null,
    completedAt: ts(10),
  };

  it("an UnderpaidBatch replay with every message already linked reuses the closed row the hint points at", () => {
    // Unreachable in normal flow (PrepareMessage would have created an
    // unlinked message first) - kept as a replay-safety fallback.
    const key = resolvePayloadKeyForEvent("UnderpaidBatch", [completedRow], {
      deferAllowed: false,
      messagePayloadIndex: 0,
      hasUnlinkedAwaitingMessage: false,
    });
    expect(key).toEqual({ action: "mutate", index: 0 });
  });

  it("an UnderpaidBatch replay with no message hint and all rows already sent defers", () => {
    const key = resolvePayloadKeyForEvent("UnderpaidBatch", [completedRow], {
      deferAllowed: false,
      hasUnlinkedAwaitingMessage: false,
    });
    expect(key).toEqual({ action: "defer" });
  });
});

describe("UnderpaidBatch resend across every payload lifecycle stage", () => {
  /** Prior-cycle message linked to row 0 plus a fresh unlinked message. */
  function resendMessages(priorStatus: SimMessage["status"]): SimMessage[] {
    return [
      { index: 0, status: priorStatus, payloadId: PAYLOAD_ID, payloadIndex: 0, preparedAt: ts(0) },
      { index: 1, status: "AwaitingBatchDelivery", payloadId: null, payloadIndex: null, preparedAt: ts(60) },
    ];
  }

  function resolveResend(row: PayloadRowForIndex, msgs: SimMessage[]): ResolvePayloadKeyResult {
    return resolvePayloadKeyForEvent("UnderpaidBatch", [row], {
      deferAllowed: false,
      messagePayloadIndex: payloadIndexFromMessages(msgs),
      hasUnlinkedAwaitingMessage: hasUnlinkedAwaitingMessage(msgs),
    });
  }

  const sentStages: [string, PayloadRowForIndex, SimMessage["status"]][] = [
    ["InTransit", { index: 0, underpaidAt: ts(0), sentAt: ts(5), deliveredAt: null, partiallyFailedAt: null, completedAt: null }, "AwaitingBatchDelivery"],
    ["Delivered", { index: 0, underpaidAt: ts(0), sentAt: ts(5), deliveredAt: ts(10), partiallyFailedAt: null, completedAt: null }, "AwaitingBatchDelivery"],
    ["PartiallyFailed", { index: 0, underpaidAt: ts(0), sentAt: ts(5), deliveredAt: ts(10), partiallyFailedAt: ts(10), completedAt: null }, "Failed"],
    ["Completed", { index: 0, underpaidAt: ts(0), sentAt: ts(5), deliveredAt: ts(10), partiallyFailedAt: null, completedAt: ts(10) }, "Executed"],
  ];

  for (const [stage, row, priorStatus] of sentStages) {
    it(`prior payload ${stage}: a resend creates payload index 1`, () => {
      expect(resolveResend(row, resendMessages(priorStatus))).toEqual({
        action: "create",
        index: 1,
      });
    });
  }

  it("prior payload Underpaid (never sent): a resend reuses the pending row", () => {
    const row: PayloadRowForIndex = {
      index: 0,
      underpaidAt: ts(0),
      sentAt: null,
      deliveredAt: null,
      partiallyFailedAt: null,
      completedAt: null,
    };
    expect(resolveResend(row, resendMessages("AwaitingBatchDelivery"))).toEqual({
      action: "mutate",
      index: 0,
    });
  });
});
