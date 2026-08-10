import { describe, expect, it } from "vitest";
import {
  hasUnlinkedAwaitingMessage,
  payloadIndexFromMessages,
  resolveHandleTargetIndex,
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
 *
 * PR #465 review follow-up: when the hinted row is OPEN the hint used to win
 * unconditionally, misrouting (a) the repay of a second underpaid instance
 * while the prior instance is InTransit / PartiallyFailed, and (b) a second
 * adapter's SendPayload (MultiAdapter emits one per adapter) while an
 * unrelated underpaid row is pending. Disambiguation is deterministic via the
 * event tx hash: a row with `sentAtTxHash` equal to the current tx hash was
 * sent by this tx (proof round / same-tx RepayBatch); otherwise a sender event
 * must prefer the open unsent row over a hint pointing at an already-sent row.
 */

const PAYLOAD_ID = `0x${"ab".repeat(32)}` as const;

const T0 = new Date("2026-07-30T17:00:00Z");
/** Monotonic clock for scenario steps. */
function ts(minutes: number): Date {
  return new Date(T0.getTime() + minutes * 60_000);
}

/** Deterministic tx hash for scenario steps sharing (or not) a transaction. */
function tx(n: number): `0x${string}` {
  return `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
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
  resolve(
    eventKind: PayloadEventKind,
    deferAllowed = false,
    currentTxHash: `0x${string}` | null = null
  ): ResolvePayloadKeyResult {
    return resolvePayloadKeyForEvent(eventKind, this.rows, {
      deferAllowed,
      messagePayloadIndex: payloadIndexFromMessages(this.msgs),
      hasUnlinkedAwaitingMessage: hasUnlinkedAwaitingMessage(this.msgs),
      currentTxHash,
    });
  }

  /** gateway:PrepareMessage - duplicate guard, then insert unlinked message. */
  prepareMessage(at: Date): "created" | "skipped" {
    const dup = this.msgs.some((m) => m.status === "AwaitingBatchDelivery" && m.payloadId == null);
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
  repayBatch(txHash: `0x${string}` | null = null): ResolvePayloadKeyResult {
    return this.resolve("RepayBatch", false, txHash);
  }

  /** multiAdapter:SendPayload - resolve, link lowest unlinked message, sentAt. */
  sendPayload(at: Date, txHash: `0x${string}` | null = null): ResolvePayloadKeyResult {
    const key = this.resolve("SendPayload", false, txHash);
    if (key.action === "defer") return key;
    const unlinked = this.msgs
      .filter((m) => m.payloadId == null && m.payloadIndex == null && m.preparedAt != null)
      .sort((a, b) => a.index - b.index)[0];
    if (unlinked) {
      unlinked.payloadId = PAYLOAD_ID;
      unlinked.payloadIndex = key.index;
    }
    this.upsertRow(key, { sentAt: at, sentAtTxHash: txHash });
    return key;
  }

  /**
   * Destination side: multiAdapter:HandlePayload receive. Routes via
   * `resolveHandleTargetIndex` like `resolvePayloadRowForHandle` does
   * (participation indices default to empty: with one adapter sending N
   * instances the participation hint is ambiguous and skipped either way)
   * and stamps deliveredAt on the resolved row.
   * @param at - Receive timestamp of the handle event
   * @param participationIndices - Distinct SEND participation payload indices
   * for the adapter issuing this handle (empty when the adapter sent every
   * instance, so the hint is ambiguous and skipped)
   */
  destDeliver(at: Date, participationIndices: number[] = []): number | null {
    const linkedMessageIndices = [
      ...new Set(
        this.msgs.map((m) => m.payloadIndex).filter((index): index is number => index != null)
      ),
    ];
    const target = resolveHandleTargetIndex(this.rows, {
      participationIndices,
      linkedMessageIndices,
      receivedAt: at,
    });
    if (target == null) return null;
    const row = this.rows.find((r) => r.index === target)!;
    row.deliveredAt ??= at;
    return target;
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

  /**
   * Destination side: lowest awaiting message fails on execute. The linked row
   * is delivered but partially failed - it stays open (completedAt null)
   * indefinitely until a retry succeeds.
   */
  destFail(at: Date): void {
    const next = this.msgs
      .filter((m) => m.status === "AwaitingBatchDelivery")
      .sort((a, b) => a.index - b.index)[0];
    if (!next) return;
    next.status = "Failed";
    const row = this.rows.find((r) => r.index === next.payloadIndex);
    if (row) {
      row.deliveredAt ??= at;
      row.partiallyFailedAt ??= at;
    }
  }

  /** Applies a resolved key with COALESCE timestamp semantics. */
  private upsertRow(
    key: Extract<ResolvePayloadKeyResult, { action: "mutate" | "create" }>,
    facts: Partial<Pick<SimRow, "underpaidAt" | "sentAt" | "sentAtTxHash">>
  ): void {
    if (key.action === "create") {
      this.rows.push({
        index: key.index,
        underpaidAt: facts.underpaidAt ?? null,
        sentAt: facts.sentAt ?? null,
        sentAtTxHash: facts.sentAt ? (facts.sentAtTxHash ?? null) : null,
        deliveredAt: null,
        partiallyFailedAt: null,
        completedAt: null,
      });
      return;
    }
    const row = this.rows.find((r) => r.index === key.index);
    if (!row) throw new Error(`mutate on missing row index ${key.index}`);
    if (facts.underpaidAt) row.underpaidAt ??= facts.underpaidAt;
    if (facts.sentAt) {
      // timestamperWithChain("sent", ...) writes sentAt + sentAtTxHash together;
      // COALESCE keeps the first writer for both.
      if (row.sentAt == null) row.sentAtTxHash = facts.sentAtTxHash ?? null;
      row.sentAt ??= facts.sentAt;
    }
  }
}

describe("hasUnlinkedAwaitingMessage", () => {
  it("returns true when a freshly prepared message is not yet linked to a payload", () => {
    expect(
      hasUnlinkedAwaitingMessage([
        { payloadIndex: 0, payloadId: PAYLOAD_ID, status: "Executed", preparedAt: ts(0) },
        {
          payloadIndex: null,
          payloadId: null,
          status: "AwaitingBatchDelivery",
          preparedAt: ts(60),
        },
      ])
    ).toBe(true);
  });

  it("returns false when every message is already linked to a payload", () => {
    expect(
      hasUnlinkedAwaitingMessage([
        {
          payloadIndex: 0,
          payloadId: PAYLOAD_ID,
          status: "AwaitingBatchDelivery",
          preparedAt: ts(0),
        },
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
  it("the second UnderpaidBatch creates its own row - the gateway underpaid counter is per send", () => {
    const sim = new SendSim();
    sim.prepareMessage(ts(0));
    expect(sim.underpaidBatch(ts(0))).toEqual({ action: "create", index: 0 });

    // Second identical send, also underpaid, before any repay. msg 0 is
    // awaiting but linked -> guard passes, msg 1 created unlinked. Each
    // instance owns its underpaid/repay/send tx hashes (facts are
    // write-once), so it must not merge into instance 0's pending row.
    expect(sim.prepareMessage(ts(10))).toBe("created");
    expect(sim.underpaidBatch(ts(10))).toEqual({ action: "create", index: 1 });
    expect(sim.msgs[0]!.payloadIndex).toBe(0);
    expect(sim.msgs[1]!.payloadIndex).toBe(1);
    expect(sim.rows).toHaveLength(2);
  });
});

describe("scenario: multiple adapters emit SendPayload for the same send (proof rounds)", () => {
  it("the second adapter's SendPayload mutates the same in-transit row", () => {
    const sim = new SendSim();
    sim.prepareMessage(ts(0));
    sim.underpaidBatch(ts(0));
    sim.repayBatch(tx(1));
    expect(sim.sendPayload(ts(5), tx(1))).toEqual({ action: "mutate", index: 0 });
    // Second adapter's SendPayload in the same tx: message already linked.
    expect(sim.sendPayload(ts(5), tx(1))).toEqual({ action: "mutate", index: 0 });
    expect(sim.rows).toHaveLength(1);
  });

  it("a second adapter's SendPayload while an unrelated underpaid row is pending mutates the row sent in this tx, not the underpaid one", () => {
    const sim = new SendSim();
    // Instance 0: underpaid, waiting for its own repay.
    sim.prepareMessage(ts(0));
    expect(sim.underpaidBatch(ts(0))).toEqual({ action: "create", index: 0 });

    // Instance 1: identical paid send via multiAdapter. MultiAdapter.send()
    // loops over all configured adapters and emits one SendPayload each
    // (MultiAdapter.sol), all in the same tx.
    sim.prepareMessage(ts(10));
    expect(sim.sendPayload(ts(10), tx(1))).toEqual({ action: "create", index: 1 });
    // Adapter #2: msg 1 is linked by now, so the new-send signal is false and
    // the min-based hint points at underpaid row 0. Row 1 carries this tx's
    // hash - the proof round belongs to it.
    expect(sim.sendPayload(ts(10), tx(1))).toEqual({ action: "mutate", index: 1 });

    // The underpaid row must not be stamped as sent by a foreign proof round.
    expect(sim.rows[0]!.sentAt).toBeNull();
    expect(sim.rows).toHaveLength(2);
  });
});

describe("scenario: repay of an underpaid instance while the prior instance is still open", () => {
  /** Row 0 sent and awaiting destination; row 1 underpaid pending repay. */
  function setupInTransitPlusUnderpaid(sim: SendSim): void {
    sim.prepareMessage(ts(0));
    sim.underpaidBatch(ts(0));
    // On-chain repay tx order: _send (SendPayload) before emit RepayBatch.
    expect(sim.sendPayload(ts(5), tx(1))).toEqual({ action: "mutate", index: 0 });
    expect(sim.repayBatch(tx(1))).toEqual({ action: "mutate", index: 0 });
    // No destination execution: row 0 stays InTransit, msg 0 awaiting.

    sim.prepareMessage(ts(20));
    expect(sim.underpaidBatch(ts(20))).toEqual({ action: "create", index: 1 });
  }

  it("the repay tx routes to the underpaid row 1, not the in-transit row 0 the hint points at", () => {
    const sim = new SendSim();
    setupInTransitPlusUnderpaid(sim);

    // Repay tx for instance 1: no PrepareMessage, both messages linked, so
    // the hint resolves to min(0, 1) = 0 while row 0 is still open.
    expect(sim.sendPayload(ts(30), tx(2))).toEqual({ action: "mutate", index: 1 });
    expect(sim.repayBatch(tx(2))).toEqual({ action: "mutate", index: 1 });

    expect(sim.rows[1]!.sentAt).toEqual(ts(30));
    expect(sim.rows[0]!.sentAt).toEqual(ts(5));
  });

  it("same with RepayBatch and SendPayload in separate txs (v3 relayer ordering)", () => {
    const sim = new SendSim();
    setupInTransitPlusUnderpaid(sim);

    // Observed on Avalanche: RepayBatch tx first, SendPayload in a later
    // relayer tx. A repay always targets an underpaid (unsent) instance.
    expect(sim.repayBatch(tx(2))).toEqual({ action: "mutate", index: 1 });
    expect(sim.sendPayload(ts(35), tx(3))).toEqual({ action: "mutate", index: 1 });

    expect(sim.rows[1]!.sentAt).toEqual(ts(35));
    expect(sim.rows[0]!.sentAt).toEqual(ts(5));
  });

  it("the repay tx routes to the underpaid row 1 while row 0 is PartiallyFailed (open indefinitely)", () => {
    const sim = new SendSim();
    sim.prepareMessage(ts(0));
    sim.underpaidBatch(ts(0));
    expect(sim.sendPayload(ts(5), tx(1))).toEqual({ action: "mutate", index: 0 });
    expect(sim.repayBatch(tx(1))).toEqual({ action: "mutate", index: 0 });
    // Destination execution fails: row 0 delivered + partially failed, open.
    sim.destFail(ts(10));
    expect(sim.rows[0]!.partiallyFailedAt).not.toBeNull();
    expect(sim.rows[0]!.completedAt).toBeNull();

    sim.prepareMessage(ts(60));
    expect(sim.underpaidBatch(ts(60))).toEqual({ action: "create", index: 1 });

    expect(sim.sendPayload(ts(70), tx(2))).toEqual({ action: "mutate", index: 1 });
    expect(sim.repayBatch(tx(2))).toEqual({ action: "mutate", index: 1 });

    expect(sim.rows[1]!.sentAt).toEqual(ts(70));
    expect(sim.rows[0]!.sentAt).toEqual(ts(5));
  });
});

describe("scenario: double-underpaid batch keeps one row per instance through both repays and deliveries", () => {
  it("the repay txs route FIFO to their own rows and one execute completes each row", () => {
    const sim = new SendSim();
    sim.prepareMessage(ts(0));
    expect(sim.underpaidBatch(ts(0))).toEqual({ action: "create", index: 0 });
    sim.prepareMessage(ts(1));
    expect(sim.underpaidBatch(ts(1))).toEqual({ action: "create", index: 1 });

    // First repay tx (SendPayload before RepayBatch, on-chain order): repays
    // are indistinguishable (identical bytes), FIFO routes to the lowest
    // open unsent row.
    expect(sim.sendPayload(ts(5), tx(1))).toEqual({ action: "mutate", index: 0 });
    expect(sim.repayBatch(tx(1))).toEqual({ action: "mutate", index: 0 });

    // Second repay tx: row 0 is sent, so FIFO routes to row 1. Each instance
    // keeps its own send tx hash instead of the second one vanishing into
    // row 0's write-once facts.
    expect(sim.sendPayload(ts(6), tx(2))).toEqual({ action: "mutate", index: 1 });
    expect(sim.repayBatch(tx(2))).toEqual({ action: "mutate", index: 1 });
    expect(sim.rows).toHaveLength(2);
    expect(sim.rows[0]!.sentAtTxHash).toBe(tx(1));
    expect(sim.rows[1]!.sentAtTxHash).toBe(tx(2));

    // Destination deliveries route FIFO to the undelivered rows in order.
    expect(sim.destDeliver(ts(9))).toBe(0);
    expect(sim.destDeliver(ts(9))).toBe(1);

    // One message instance execute completes each row.
    sim.destExecuteAndComplete(ts(10));
    expect(sim.rows[0]!.completedAt).not.toBeNull();
    expect(sim.rows[1]!.completedAt).toBeNull();
    sim.destExecuteAndComplete(ts(11));
    expect(sim.rows[1]!.completedAt).not.toBeNull();
  });
});

describe("scenario: pharos 2026-08 incident - four underpaid instances of one batch", () => {
  it("every instance keeps its own row, tx hashes, delivery, and completion", () => {
    const sim = new SendSim();

    // Instance 0: full underpaid cycle to completion.
    sim.prepareMessage(ts(0));
    expect(sim.underpaidBatch(ts(0))).toEqual({ action: "create", index: 0 });
    expect(sim.sendPayload(ts(5), tx(1))).toEqual({ action: "mutate", index: 0 });
    expect(sim.repayBatch(tx(1))).toEqual({ action: "mutate", index: 0 });
    expect(sim.destDeliver(ts(8))).toBe(0);
    sim.destExecuteAndComplete(ts(9));
    expect(sim.rows[0]!.completedAt).not.toBeNull();

    // Instance 1: repaid and sent, still in transit.
    sim.prepareMessage(ts(20));
    expect(sim.underpaidBatch(ts(20))).toEqual({ action: "create", index: 1 });
    expect(sim.sendPayload(ts(25), tx(2))).toEqual({ action: "mutate", index: 1 });
    expect(sim.repayBatch(tx(2))).toEqual({ action: "mutate", index: 1 });

    // Instance 2: underpaid, awaiting its repay.
    sim.prepareMessage(ts(30));
    expect(sim.underpaidBatch(ts(30))).toEqual({ action: "create", index: 2 });

    // Instance 3 (the invisible pharos send 0x5c3b...): arrives while rows are
    // completed / in-transit / unsent. Old logic merged it into unsent row 2,
    // losing its underpaid and repay tx hashes forever.
    sim.prepareMessage(ts(40));
    expect(sim.underpaidBatch(ts(40))).toEqual({ action: "create", index: 3 });
    expect(sim.rows).toHaveLength(4);

    // Repays route FIFO: instance 2 first, then instance 3.
    expect(sim.sendPayload(ts(45), tx(3))).toEqual({ action: "mutate", index: 2 });
    expect(sim.repayBatch(tx(3))).toEqual({ action: "mutate", index: 2 });
    expect(sim.sendPayload(ts(50), tx(4))).toEqual({ action: "mutate", index: 3 });
    expect(sim.repayBatch(tx(4))).toEqual({ action: "mutate", index: 3 });
    expect(sim.rows.map((r) => r.sentAtTxHash)).toEqual([tx(1), tx(2), tx(3), tx(4)]);

    // Deliveries route FIFO to undelivered rows - the min-index message hint
    // must not pin them onto completed row 0 (the stuck Delivered /
    // completedAt: null bookkeeping observed on staging).
    expect(sim.destDeliver(ts(55))).toBe(1);
    expect(sim.destDeliver(ts(56))).toBe(2);
    expect(sim.destDeliver(ts(57))).toBe(3);

    // Each execute completes exactly one instance row.
    sim.destExecuteAndComplete(ts(60));
    sim.destExecuteAndComplete(ts(61));
    sim.destExecuteAndComplete(ts(62));
    expect(sim.rows.every((r) => r.completedAt != null)).toBe(true);
  });
});

describe("scenario: a handle from an adapter whose only SEND participation is a specific instance routes to that instance", () => {
  it("the unique participation hint beats FIFO and the min-index message hint", () => {
    const sim = new SendSim();

    // Instance 0: sent and delivered by adapter A.
    sim.prepareMessage(ts(0));
    expect(sim.underpaidBatch(ts(0))).toEqual({ action: "create", index: 0 });
    expect(sim.sendPayload(ts(5), tx(1))).toEqual({ action: "mutate", index: 0 });
    expect(sim.destDeliver(ts(8))).toBe(0);

    // Instance 1: sent later, in transit, not yet delivered.
    sim.prepareMessage(ts(20));
    expect(sim.underpaidBatch(ts(20))).toEqual({ action: "create", index: 1 });
    expect(sim.sendPayload(ts(25), tx(2))).toEqual({ action: "mutate", index: 1 });

    // Adapter A only sent instance 0 (its SEND participations = [0]). A later
    // HandlePayload from adapter A is an idempotent replay of instance 0's
    // delivery. FIFO over undelivered open sent rows would pick row 1, and
    // the min-index message hint would also collapse to 0, but the unique
    // participation hint identifies instance 0 directly and must win.
    expect(sim.destDeliver(ts(30), [0])).toBe(0);
    // Row 1 stays undelivered: the replay did not steal its delivery slot.
    expect(sim.rows[1]!.deliveredAt).toBeNull();
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
      {
        index: 1,
        status: "AwaitingBatchDelivery",
        payloadId: null,
        payloadIndex: null,
        preparedAt: ts(60),
      },
    ];
  }

  /** Resolves an UnderpaidBatch resend against one prior row, deriving hints from msgs. */
  function resolveResend(row: PayloadRowForIndex, msgs: SimMessage[]): ResolvePayloadKeyResult {
    return resolvePayloadKeyForEvent("UnderpaidBatch", [row], {
      deferAllowed: false,
      messagePayloadIndex: payloadIndexFromMessages(msgs),
      hasUnlinkedAwaitingMessage: hasUnlinkedAwaitingMessage(msgs),
    });
  }

  const sentStages: [string, PayloadRowForIndex, SimMessage["status"]][] = [
    [
      "InTransit",
      {
        index: 0,
        underpaidAt: ts(0),
        sentAt: ts(5),
        deliveredAt: null,
        partiallyFailedAt: null,
        completedAt: null,
      },
      "AwaitingBatchDelivery",
    ],
    [
      "Delivered",
      {
        index: 0,
        underpaidAt: ts(0),
        sentAt: ts(5),
        deliveredAt: ts(10),
        partiallyFailedAt: null,
        completedAt: null,
      },
      "AwaitingBatchDelivery",
    ],
    [
      "PartiallyFailed",
      {
        index: 0,
        underpaidAt: ts(0),
        sentAt: ts(5),
        deliveredAt: ts(10),
        partiallyFailedAt: ts(10),
        completedAt: null,
      },
      "Failed",
    ],
    [
      "Completed",
      {
        index: 0,
        underpaidAt: ts(0),
        sentAt: ts(5),
        deliveredAt: ts(10),
        partiallyFailedAt: null,
        completedAt: ts(10),
      },
      "Executed",
    ],
  ];

  for (const [stage, row, priorStatus] of sentStages) {
    it(`prior payload ${stage}: a resend creates payload index 1`, () => {
      expect(resolveResend(row, resendMessages(priorStatus))).toEqual({
        action: "create",
        index: 1,
      });
    });
  }

  it("prior payload Underpaid (never sent): a resend creates payload index 1", () => {
    // The pending row belongs to the earlier instance still awaiting its own
    // repay; the fresh unlinked message marks a new gateway counter increment.
    const row: PayloadRowForIndex = {
      index: 0,
      underpaidAt: ts(0),
      sentAt: null,
      deliveredAt: null,
      partiallyFailedAt: null,
      completedAt: null,
    };
    expect(resolveResend(row, resendMessages("AwaitingBatchDelivery"))).toEqual({
      action: "create",
      index: 1,
    });
  });
});
