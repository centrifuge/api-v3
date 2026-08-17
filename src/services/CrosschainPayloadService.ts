import { eq } from "drizzle-orm";
import {
  assignUpdateSetSql,
  emptyUpdateSet,
  type PgInsertValue,
  type PgUpdateSetSource,
} from "../helpers/drizzleUpsert";
import { CrosschainPayload } from "ponder:schema";
import { Service, type DataWithoutDefaults, type ReadOnlyContext } from "./Service";
import { Event, Context } from "ponder:registry";
import { getCrosschainMessageLength } from ".";
import { keccak256, encodePacked } from "viem";
import { expandInlineObject, serviceError, serviceLog } from "../helpers/logger";
import { RegistryVersions } from "../chains";
import {
  mergeCoalesce,
  mergeEarliest,
  mergeSenderWinsUnlessPlaceholder,
} from "../helpers/upsertMerge";
import { CROSSCHAIN_RAW_DATA_STUB } from "./CrosschainMessageService";
import { CrosschainMessageService } from "./CrosschainMessageService";
import {
  payloadSimpleStatusSetSql,
  payloadStatusForInsertSql,
  refreshPayloadStatusSql,
  type PayloadStatusReceiveAnchor,
} from "./crosschainStatusSql";

export type { PayloadStatusReceiveAnchor } from "./crosschainStatusSql";

const PAYLOAD_TABLE = "crosschain_payload";

/** Null timestamp facts without chain id for merge SET excluded.* gates. */
function nullTimestamper<N extends string>(fieldName: N) {
  return {
    [`${fieldName}At`]: null,
    [`${fieldName}AtBlock`]: null,
    [`${fieldName}AtTxHash`]: null,
  } as Record<string, null>;
}

/** Null timestamp + chain-id facts for merge SET excluded.* gates. */
function nullTimestamperWithChain<N extends string>(fieldName: N) {
  return {
    [`${fieldName}At`]: null,
    [`${fieldName}AtBlock`]: null,
    [`${fieldName}AtTxHash`]: null,
    [`${fieldName}AtChainId`]: null,
  } as Record<string, null>;
}

/** Null fact columns referenced in payload merge SET. */
export const NULL_CROSSCHAIN_PAYLOAD_FACTS = {
  poolId: null,
  tokenId: null,
  gasLimit: null,
  gasPrice: null,
  ...nullTimestamperWithChain("underpaid"),
  ...nullTimestamperWithChain("sent"),
  ...nullTimestamper("delivered"),
  ...nullTimestamper("completed"),
  ...nullTimestamperWithChain("partiallyFailed"),
};

const PAYLOAD_TIMESTAMP_FACTS_WITH_CHAIN = ["underpaid", "sent", "partiallyFailed"] as const;
const PAYLOAD_TIMESTAMP_FACTS = ["delivered", "completed"] as const;

/**
 * Converts camelCase to snake_case for SQL column names.
 * @param s - camelCase string
 * @returns snake_case string
 */
function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Builds ON CONFLICT SET for crosschain_payload fact merge + derived status.
 * @returns Conflict set map for Drizzle upsert
 */
export function buildCrosschainPayloadConflictSet(): PgUpdateSetSource<typeof CrosschainPayload> {
  const set = emptyUpdateSet<typeof CrosschainPayload>();
  type ConflictKey = keyof PgUpdateSetSource<typeof CrosschainPayload> & string;

  for (const base of PAYLOAD_TIMESTAMP_FACTS_WITH_CHAIN) {
    const pgAt = `${camelToSnake(base)}_at`;
    const pgBlock = `${camelToSnake(base)}_at_block`;
    const pgTx = `${camelToSnake(base)}_at_tx_hash`;
    const pgChain = `${camelToSnake(base)}_at_chain_id`;
    assignUpdateSetSql(set, `${base}At` as ConflictKey, mergeEarliest(PAYLOAD_TABLE, pgAt));
    assignUpdateSetSql(set, `${base}AtBlock` as ConflictKey, mergeCoalesce(PAYLOAD_TABLE, pgBlock));
    assignUpdateSetSql(set, `${base}AtTxHash` as ConflictKey, mergeCoalesce(PAYLOAD_TABLE, pgTx));
    assignUpdateSetSql(
      set,
      `${base}AtChainId` as ConflictKey,
      mergeCoalesce(PAYLOAD_TABLE, pgChain)
    );
  }

  for (const base of PAYLOAD_TIMESTAMP_FACTS) {
    const pgAt = `${camelToSnake(base)}_at`;
    const pgBlock = `${camelToSnake(base)}_at_block`;
    const pgTx = `${camelToSnake(base)}_at_tx_hash`;
    assignUpdateSetSql(set, `${base}At` as ConflictKey, mergeEarliest(PAYLOAD_TABLE, pgAt));
    assignUpdateSetSql(set, `${base}AtBlock` as ConflictKey, mergeCoalesce(PAYLOAD_TABLE, pgBlock));
    assignUpdateSetSql(set, `${base}AtTxHash` as ConflictKey, mergeCoalesce(PAYLOAD_TABLE, pgTx));
  }

  set.poolId = mergeCoalesce(PAYLOAD_TABLE, "pool_id");
  set.tokenId = mergeCoalesce(PAYLOAD_TABLE, "token_id");
  set.rawData = mergeSenderWinsUnlessPlaceholder(
    PAYLOAD_TABLE,
    "raw_data",
    CROSSCHAIN_RAW_DATA_STUB
  );
  set.fromCentrifugeId = mergeCoalesce(PAYLOAD_TABLE, "from_centrifuge_id");
  set.toCentrifugeId = mergeCoalesce(PAYLOAD_TABLE, "to_centrifuge_id");
  set.gasLimit = mergeCoalesce(PAYLOAD_TABLE, "gas_limit");
  set.gasPrice = mergeCoalesce(PAYLOAD_TABLE, "gas_price");
  set.status = payloadSimpleStatusSetSql();

  return set;
}

/** Minimal payload row shape for open/closed and index resolution. */
export type PayloadRowForIndex = {
  index: number;
  completedAt?: Date | null;
  sentAt?: Date | null;
  sentAtTxHash?: `0x${string}` | null;
  underpaidAt?: Date | null;
  deliveredAt?: Date | null;
  partiallyFailedAt?: Date | null;
};

/** Minimal message row shape for payload index linkage. */
type MessageRowForPayloadIndex = {
  payloadIndex?: number | null;
  payloadId?: `0x${string}` | null;
  status?: string | null;
  preparedAt?: Date | null;
};

/**
 * Whether any message row is a freshly prepared, unlinked awaiting message.
 * Such a row signals a genuine new send attempt (a brand-new `PrepareMessage`
 * created it), as opposed to a late duplicate of an already-linked batch.
 * @param messages - Message rows loaded for the batch's message ids
 * @returns True when an unlinked `AwaitingBatchDelivery` row exists
 */
export function hasUnlinkedAwaitingMessage(messages: MessageRowForPayloadIndex[]): boolean {
  return messages.some(
    (m) => m.status === "AwaitingBatchDelivery" && m.payloadId == null && m.preparedAt != null
  );
}

/** Sender / receive payload events that allocate or target `(payloadId, index)`. */
export type PayloadEventKind = "UnderpaidBatch" | "RepayBatch" | "SendPayload" | "HandlePayload";

/** Result of resolving which payload index an event should upsert. */
export type ResolvePayloadKeyResult =
  { action: "mutate"; index: number } | { action: "create"; index: number } | { action: "defer" };

/**
 * Whether a payload row is terminal (no further sender-side mutations).
 * @param row - Payload row facts
 * @returns True when `completedAt` is set
 */
function isPayloadRowClosed(row: PayloadRowForIndex): boolean {
  return row.completedAt != null;
}

/**
 * Whether a payload row can still accept repay / send / delivery facts.
 * @param row - Payload row facts
 * @returns True when not completed
 */
function isPayloadRowOpen(row: PayloadRowForIndex): boolean {
  return !isPayloadRowClosed(row);
}

/**
 * Lowest-index open payload row for a `payloadId`, or null.
 * @param rows - All rows for one payload id (any order)
 * @returns Open row with minimum `index`, or null
 */
export function pickOpenPayloadRowAmong(rows: PayloadRowForIndex[]): PayloadRowForIndex | null {
  const open = rows.filter(isPayloadRowOpen).sort((a, b) => a.index - b.index);
  return open[0] ?? null;
}

/**
 * Whether a payload row has been sent (`sentAt` set).
 * @param row - Payload row facts
 * @returns True when `sentAt` is set
 */
export function isPayloadSent(row: PayloadRowForIndex): boolean {
  return row.sentAt != null;
}

/**
 * Lowest-index unsent payload row for a `payloadId`, or null.
 * @param rows - All rows for one payload id (any order)
 * @returns Unsent row with minimum `index`, or null
 */
function pickLowestUnsentRowAmong(rows: PayloadRowForIndex[]): PayloadRowForIndex | null {
  const unsent = rows.filter((r) => !isPayloadSent(r)).sort((a, b) => a.index - b.index);
  return unsent[0] ?? null;
}

/**
 * Lowest-index open AND unsent payload row for a `payloadId`, or null.
 * Excludes closed-but-unsent rows (corrupt/replayed state) so a send never
 * mutates a completed row that was skipped over.
 * @param rows - All rows for one payload id (any order)
 * @returns Open unsent row with minimum `index`, or null
 */
function pickLowestOpenUnsentRowAmong(rows: PayloadRowForIndex[]): PayloadRowForIndex | null {
  const candidates = rows
    .filter((r) => isPayloadRowOpen(r) && !isPayloadSent(r))
    .sort((a, b) => a.index - b.index);
  return candidates[0] ?? null;
}

/**
 * Next index when starting a new send attempt.
 * @param rows - All rows for one payload id
 * @returns `0` when empty, else `MAX(index) + 1`
 */
function nextPayloadIndex(rows: PayloadRowForIndex[]): number {
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => r.index)) + 1;
}

/**
 * Unique `payloadIndex` from linked message rows (includes batch-only rows).
 * @param messages - Message rows sharing a payload id
 * @returns Single index, or null when none linked
 */
export function payloadIndexFromMessages(messages: MessageRowForPayloadIndex[]): number | null {
  const indices = new Set<number>();
  for (const message of messages) {
    if (message.payloadIndex != null) indices.add(message.payloadIndex);
  }
  if (indices.size === 0) return null;
  if (indices.size === 1) return [...indices][0]!;
  return Math.min(...indices);
}

/**
 * Resolves payload `(id, index)` for a sender-side or handle event.
 * @param eventKind - Event being processed
 * @param rows - All committed payload rows for the id
 * @param options - Defer flag, optional message linkage hint, new-send flag, and current tx hash
 * @returns Mutate existing index, create new index, or defer (cross-chain)
 */
export function resolvePayloadKeyForEvent(
  eventKind: PayloadEventKind,
  rows: PayloadRowForIndex[],
  options: {
    deferAllowed: boolean;
    messagePayloadIndex?: number | null;
    hasUnlinkedAwaitingMessage?: boolean;
    /** Tx hash of the event being resolved; matches rows sent in the same tx. */
    currentTxHash?: `0x${string}` | null;
  }
): ResolvePayloadKeyResult {
  const open = pickOpenPayloadRowAmong(rows);
  const newSend = options.hasUnlinkedAwaitingMessage === true;
  const currentTxHash = options.currentTxHash ?? null;

  // Same-tx rule: a row whose sentAtTxHash equals the current tx hash was sent
  // by this very transaction - subsequent SendPayload events in the tx are
  // adapter proof rounds for that send, and RepayBatch fires after `_send` in
  // the same repay tx. This identity beats the min-based message hint, which
  // can point at an older open row of another send instance.
  if (
    !newSend &&
    currentTxHash != null &&
    (eventKind === "SendPayload" || eventKind === "RepayBatch")
  ) {
    const sameTx = rows.find((r) => r.sentAtTxHash != null && r.sentAtTxHash === currentTxHash);
    if (sameTx) return { action: "mutate", index: sameTx.index };
  }

  // A genuine new send carries a freshly prepared, unlinked awaiting message.
  // The `messagePayloadIndex` hint is derived from prior (now terminal) linked
  // messages and must not pull the event back onto a closed row; only apply the
  // hint for late duplicates (no unlinked awaiting message).
  if (!newSend && options.messagePayloadIndex != null) {
    const linked = rows.find((r) => r.index === options.messagePayloadIndex);
    if (linked) {
      const senderEvent = eventKind === "UnderpaidBatch" || eventKind === "SendPayload";
      const sendTargetEvent = senderEvent || eventKind === "RepayBatch";
      // With multiple rows per payload id the hint resolves to the LOWEST
      // linked index, which may belong to a prior send that is still open
      // (InTransit / PartiallyFailed). A send-targeting event must not follow
      // the hint onto an already-sent row while an open unsent row (another
      // instance awaiting its repay-send) exists - the per-event logic below
      // routes it to that unsent row instead.
      const staleSentHint =
        sendTargetEvent && isPayloadSent(linked) && pickLowestOpenUnsentRowAmong(rows) != null;
      // A closed hinted row is only reused as a replay fallback when no open
      // row exists. With multiple rows per payload id the hint resolves to the
      // LOWEST linked index, which may be a prior completed send - the event
      // must then route to the open row via the per-event logic below.
      if (!staleSentHint && (isPayloadRowOpen(linked) || (senderEvent && !open))) {
        return { action: "mutate", index: linked.index };
      }
    }
  }

  switch (eventKind) {
    case "UnderpaidBatch":
      if (rows.length === 0) return { action: "create", index: 0 };
      // A genuine new underpaid send (fresh unlinked PrepareMessage in this
      // tx) is a distinct batch instance: the gateway underpaid counter
      // increments once per send. An existing open unsent row belongs to an
      // EARLIER underpaid instance still awaiting its own repay - merging
      // into it loses the multiplicity (the new instance's underpaid facts
      // have nowhere to land, since facts are write-once).
      if (newSend) return { action: "create", index: nextPayloadIndex(rows) };
      {
        const unsent = pickLowestUnsentRowAmong(rows);
        if (unsent) return { action: "mutate", index: unsent.index };
      }
      // Defer is reserved for late duplicates: they carry no unlinked awaiting
      // message and every row is already sent.
      return { action: "defer" };

    case "RepayBatch": {
      // A repay targets an underpaid instance, which is by definition unsent
      // (Gateway.repay requires underpaid counter > 0). Prefer the open unsent
      // row over an older open in-transit row; the plain open fallback covers
      // the same-tx repay ordering where SendPayload already stamped the row
      // (then caught by the same-tx rule above) and replayed events.
      const openUnsent = pickLowestOpenUnsentRowAmong(rows);
      if (openUnsent) return { action: "mutate", index: openUnsent.index };
      if (open) return { action: "mutate", index: open.index };
      return { action: "defer" };
    }

    case "SendPayload": {
      // Genuine new send (paid path, unlinked message from this tx's
      // PrepareMessage): never reuse an existing row - a pending underpaid row
      // belongs to another instance awaiting its own RepayBatch -> SendPayload.
      if (newSend) {
        return { action: "create", index: nextPayloadIndex(rows) };
      }
      // Repay path / adapter rounds: the row being sent is the open unsent one
      // (repaid underpaid instance); otherwise the open in-transit row (proof
      // rounds re-emit SendPayload for an already-sent payload).
      const openUnsent = pickLowestOpenUnsentRowAmong(rows);
      if (openUnsent) return { action: "mutate", index: openUnsent.index };
      if (open) return { action: "mutate", index: open.index };
      if (rows.length === 0) return { action: "create", index: 0 };
      return options.deferAllowed
        ? { action: "defer" }
        : { action: "create", index: nextPayloadIndex(rows) };
    }

    case "HandlePayload": {
      const openSent = rows
        .filter((r) => isPayloadRowOpen(r) && r.sentAt != null)
        .sort((a, b) => a.index - b.index);
      // One delivery lands per sent instance: prefer the lowest sent row not
      // yet delivered so a later instance's delivery does not restamp a row
      // that already received its own. A handle must target a sent row - a
      // receive cannot belong to an underpaid (not-yet-sent) instance - so
      // with no open sent row the event defers and waits in the receive
      // queue for the send to be indexed.
      const undelivered = openSent.find((r) => r.deliveredAt == null);
      if (undelivered) return { action: "mutate", index: undelivered.index };
      if (openSent[0]) return { action: "mutate", index: openSent[0].index };
      return { action: "defer" };
    }

    default: {
      const _exhaustive: never = eventKind;
      return _exhaustive;
    }
  }
}

/** Routing hints for a destination-side handle receive (HandlePayload / HandleProof). */
export type HandleTargetHints = {
  /** Distinct payload indices of this adapter's SEND participations. */
  participationIndices: readonly number[];
  /** Distinct payload indices of committed messages linked to the payload id. */
  linkedMessageIndices: readonly number[];
  /**
   * Receive timestamp of the handle event. FIFO resolution skips rows whose
   * send postdates it: a receive cannot belong to an instance sent after it,
   * and routing a replayed delivery onto one would strand the entry in the
   * receive queue behind a causal-order check it can never pass. Only sent
   * rows are eligible targets, so the anchor is always `sentAt`.
   */
  receivedAt?: Date | null;
};

/**
 * Resolves which payload row a destination-side handle receive belongs to.
 *
 * Only sent rows are eligible targets: a handle receive means the adapter
 * received a payload that was actually sent on the source chain, so an
 * unsent (underpaid) row is never returned - the entry stays queued until
 * the send is indexed.
 *
 * Precedence: (1) the adapter's own SEND participation when it identifies
 * exactly one instance; (2) message linkage when it identifies exactly one
 * instance (single-instance case, including idempotent replays onto a
 * completed row); (3) FIFO over causally-possible open sent rows via
 * {@link resolvePayloadKeyForEvent} - ambiguous multi-instance linkage must
 * NOT collapse to the minimum index, which pins every later instance's
 * delivery onto the first (usually completed) row; (4) with no open row left,
 * the lowest linked row as an idempotent replay fallback.
 * @param rows - All committed payload rows for the id
 * @param hints - Participation / message linkage indices and receive time
 * @returns Target row index, or null when no row can accept the receive
 */
export function resolveHandleTargetIndex(
  rows: PayloadRowForIndex[],
  hints: HandleTargetHints
): number | null {
  if (rows.length === 0) return null;

  // A handle receive can only belong to a sent instance. Routing a handle to
  // an unsent (underpaid) row would stamp deliveredAt before sentAt is set,
  // inverting the timeline, so unsent rows are never eligible targets.
  const sentRows = rows.filter((r) => r.sentAt != null);
  if (sentRows.length === 0) return null;
  const has = (index: number) => sentRows.some((r) => r.index === index);

  if (hints.participationIndices.length === 1 && has(hints.participationIndices[0]!)) {
    return hints.participationIndices[0]!;
  }

  if (hints.linkedMessageIndices.length === 1 && has(hints.linkedMessageIndices[0]!)) {
    return hints.linkedMessageIndices[0]!;
  }

  const receivedAtMs = hints.receivedAt?.getTime();
  const causallyPossible =
    receivedAtMs == null
      ? sentRows
      : sentRows.filter((r) => {
          const anchor = getPayloadSendAnchorAt({
            sentAt: r.sentAt ?? null,
            underpaidAt: r.underpaidAt ?? null,
          });
          return anchor != null && anchor.getTime() <= receivedAtMs;
        });
  const key = resolvePayloadKeyForEvent(
    "HandlePayload",
    causallyPossible.length > 0 ? causallyPossible : sentRows,
    { deferAllowed: true }
  );
  if (key.action === "mutate") return key.index;

  if (hints.linkedMessageIndices.length > 0) {
    const lowest = Math.min(...hints.linkedMessageIndices);
    if (has(lowest)) return lowest;
  }
  return null;
}

/**
 * Send anchor timestamp for a committed payload row.
 * @param row - Payload row data
 * @returns Anchor time or null
 */
export function getPayloadSendAnchorAt(row: {
  sentAt: Date | null;
  underpaidAt: Date | null;
}): Date | null {
  return row.sentAt ?? row.underpaidAt ?? null;
}

/**
 * Service class for managing CrosschainPayload entities (primary key `id` + `payloadIndex`).
 *
 * **v3:** Typically one active row per `payloadId` through underpaid → in-transit; adapters may add
 * proof rounds (see multi-adapter handlers). **v3_1:** Multiple rows per `payloadId` (1..n indices)
 * are normal; there is no adapter proof phase.
 *
 * @extends {Service<typeof CrosschainPayload>}
 */
export class CrosschainPayloadService extends Service<typeof CrosschainPayload> {
  static readonly entityTable = CrosschainPayload;
  static readonly entityName = "CrosschainPayload";

  /**
   * Next payload index for a payloadId (MAX(index)+1).
   * @param context - Ponder context
   * @param payloadId - Payload id
   * @returns Next index (0 when none exist)
   */
  static async nextPayloadIndex(context: Context, payloadId: `0x${string}`): Promise<number> {
    const rows = await CrosschainPayloadService.loadAllForPayloadId(context, payloadId);
    return rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.read().index)) + 1;
  }

  /**
   * All payload rows for a `payloadId`, sorted by `index` ascending.
   * @param context - Ponder context
   * @param payloadId - Payload id
   * @returns Service instances
   */
  static async loadAllForPayloadId(
    context: Context | ReadOnlyContext,
    payloadId: `0x${string}`
  ): Promise<CrosschainPayloadService[]> {
    serviceLog("CrosschainPayload loadAllForPayloadId", expandInlineObject({ payloadId }));
    return (await CrosschainPayloadService.query(context, {
      id: payloadId,
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
  }

  /**
   * Lowest-index open payload row for a `payloadId`.
   * @param context - Ponder context
   * @param payloadId - Payload id
   * @returns Open row or null
   */
  static async findOpenPayloadCandidate(
    context: Context | ReadOnlyContext,
    payloadId: `0x${string}`
  ): Promise<CrosschainPayloadService | null> {
    const rows = await CrosschainPayloadService.loadAllForPayloadId(context, payloadId);
    const candidate = pickOpenPayloadRowAmong(rows.map((r) => r.read()));
    if (!candidate) return null;
    return rows.find((r) => r.read().index === candidate.index) ?? null;
  }

  /**
   * Resolves which `(payloadId, index)` key an event should upsert.
   * @param context - Ponder context
   * @param payloadId - Payload id
   * @param eventKind - Sender/handle event kind
   * @param options - Defer flag, optional batch message ids for linkage, and current tx hash
   * @returns Mutate, create, or defer
   */
  static async resolvePayloadKey(
    context: Context,
    payloadId: `0x${string}`,
    eventKind: PayloadEventKind,
    options: {
      deferAllowed: boolean;
      messageIds?: readonly `0x${string}`[];
      currentTxHash?: `0x${string}` | null;
    }
  ): Promise<ResolvePayloadKeyResult> {
    const rows = await CrosschainPayloadService.loadAllForPayloadId(context, payloadId);
    const rowData = rows.map((r) => r.read());

    let messagePayloadIndex: number | null = null;
    let unlinkedAwaiting = false;
    if (options.messageIds?.length) {
      const byId = await CrosschainMessageService.loadCrosschainMessagesByMessageIds(
        context,
        options.messageIds
      );
      const flat = [...byId.values()].flat().map((r) => r.read());
      messagePayloadIndex = payloadIndexFromMessages(flat);
      unlinkedAwaiting = hasUnlinkedAwaitingMessage(flat);
    }

    serviceLog(
      "CrosschainPayload resolvePayloadKey",
      expandInlineObject({
        payloadId,
        eventKind,
        messagePayloadIndex,
        unlinkedAwaiting,
        currentTxHash: options.currentTxHash ?? null,
        rowCount: rowData.length,
      })
    );

    return resolvePayloadKeyForEvent(eventKind, rowData, {
      deferAllowed: options.deferAllowed,
      messagePayloadIndex,
      hasUnlinkedAwaitingMessage: unlinkedAwaiting,
      currentTxHash: options.currentTxHash ?? null,
    });
  }

  /**
   * Upserts fact columns and recomputes status via SQL CASE (multichain-safe).
   *
   * INSERT `status` uses {@link payloadStatusForInsertSql}; ON CONFLICT uses
   * {@link payloadSimpleStatusSetSql}. Never default INSERT status in TypeScript.
   * @param context - Ponder context
   * @param event - Source event
   * @param key - Payload primary key
   * @param facts - Fact fields (explicit `status` optional; otherwise SQL-derived on insert)
   * @returns Service instance
   */
  static async upsertFacts(
    context: Context,
    event: Extract<Event, { transaction: { hash: `0x${string}` } }>,
    key: { id: `0x${string}`; index: number },
    facts: Partial<DataWithoutDefaults<typeof CrosschainPayload>>
  ): Promise<CrosschainPayloadService> {
    serviceLog(
      "CrosschainPayload upsertFacts",
      expandInlineObject({ id: key.id, index: key.index })
    );
    const mergedFacts = { ...NULL_CROSSCHAIN_PAYLOAD_FACTS, ...facts };
    const row: PgInsertValue<typeof CrosschainPayload> = {
      ...mergedFacts,
      ...key,
      rawData: facts.rawData ?? CROSSCHAIN_RAW_DATA_STUB,
      fromCentrifugeId: facts.fromCentrifugeId ?? "0",
      toCentrifugeId: facts.toCentrifugeId ?? "0",
      status: facts.status ?? payloadStatusForInsertSql(mergedFacts),
      createdAt: new Date(Number(event.block.timestamp) * 1000),
      createdAtBlock: Number(event.block.number),
      createdAtTxHash: event.transaction.hash,
    };

    const conflictSet = buildCrosschainPayloadConflictSet();
    const [entity] = await context.db.sql
      .insert(CrosschainPayload)
      .values(row)
      .onConflictDoUpdate({
        target: [CrosschainPayload.id, CrosschainPayload.index],
        set: conflictSet,
      })
      .returning();

    if (!entity) throw new Error(`CrosschainPayload upsertFacts failed for ${key.id}`);
    return new CrosschainPayloadService(CrosschainPayload, "CrosschainPayload", context, entity);
  }

  /**
   * Recomputes derived payload facts and status from SQL aggregates (single UPDATE).
   * @param context - Ponder context
   * @param anchor - Receive event anchor for newly set derived timestamps
   * @param payloadId - Payload id
   * @param payloadIndex - Payload index
   * @param options - Whether to set deliveredAt from anchor (gateway message receive)
   */
  static async refreshPayloadStatusFromAggregates(
    context: Context,
    anchor: PayloadStatusReceiveAnchor,
    payloadId: `0x${string}`,
    payloadIndex: number,
    options: { setDeliveredFromAnchor?: boolean } = {}
  ): Promise<void> {
    serviceLog(
      "CrosschainPayload refreshPayloadStatusFromAggregates",
      expandInlineObject({ payloadId, payloadIndex, setDelivered: options.setDeliveredFromAnchor })
    );
    await context.db.sql.execute(refreshPayloadStatusSql(anchor, payloadId, payloadIndex, options));
  }

  /**
   * Looks up a payload by the transaction hash that created the row on the source chain.
   * @param context - Ponder context
   * @param createdAtTxHash - Creation transaction hash
   * @returns Payload service instance or null
   */
  static async getByCreatedAtTxHash(
    context: Context | ReadOnlyContext,
    createdAtTxHash: `0x${string}`
  ): Promise<CrosschainPayloadService | null> {
    const table = this.entityTable;
    const name = this.entityName;
    const db = "sql" in context.db ? context.db.sql : context.db;
    serviceLog(`${name} getByCreatedAtTxHash`, expandInlineObject({ createdAtTxHash }));
    const [entity] = await db
      .select()
      .from(table)
      .where(eq(CrosschainPayload.createdAtTxHash, createdAtTxHash))
      .limit(1);
    if (!entity) return null;
    return new this(table, name, context, entity) as CrosschainPayloadService;
  }

  /**
   * Gets the first payload from the queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getUndeliveredFromQueue(context: Context, payloadId: `0x${string}`) {
    serviceLog("CrosschainPayload getUndeliveredFromQueue", expandInlineObject({ payloadId }));
    const crosschainMessages = (await this.query(context, {
      id: payloadId,
      status_not: "Delivered",
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainMessages.length === 0) return null;
    return crosschainMessages.shift()!;
  }

  /**
   * Gets the first payload from the in transit or delivered queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getInTransitOrDeliveredFromQueue(context: Context, payloadId: `0x${string}`) {
    serviceLog(
      "CrosschainPayload getInTransitOrDeliveredFromQueue",
      expandInlineObject({ payloadId })
    );
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status_in: ["InTransit", "Delivered"],
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }

  /**
   * Gets the first payload from the underpaid queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getUnderpaidFromQueue(context: Context, payloadId: `0x${string}`) {
    serviceLog("CrosschainPayload getUnderpaidFromQueue", expandInlineObject({ payloadId }));
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status: "Underpaid",
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }

  /**
   * Gets the first payload from the underpaid or in transit queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getUnderpaidOrInTransitFromQueue(context: Context, payloadId: `0x${string}`) {
    serviceLog(
      "CrosschainPayload getUnderpaidOrInTransitFromQueue",
      expandInlineObject({ payloadId })
    );
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status_in: ["Underpaid", "InTransit"],
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];

    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }

  /**
   * Gets the first payload from the queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getDeliveredFromQueue(context: Context, payloadId: `0x${string}`) {
    serviceLog("CrosschainPayload getDeliveredFromQueue", expandInlineObject({ payloadId }));
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status: "Delivered",
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }

  /**
   * Gets the first payload from the queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getDeliveredOrPartiallyFailedFromQueue(context: Context, payloadId: `0x${string}`) {
    serviceLog(
      "CrosschainPayload getDeliveredOrPartiallyFailedFromQueue",
      expandInlineObject({ payloadId })
    );
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status_in: ["Delivered", "PartiallyFailed"],
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }

  /**
   * Gets the first incomplete payload from the queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first incomplete payload from the queue or null if no payload is found
   */
  static async getIncompleteFromQueue(context: Context, payloadId: `0x${string}`) {
    serviceLog("CrosschainPayload getIncompleteFromQueue", expandInlineObject({ payloadId }));
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status_not: "Completed",
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }
}

/**
 * Extracts individual cross-chain messages from a concatenated payload
 *
 * Takes a hex-encoded payload containing multiple concatenated messages and splits it into
 * individual message bytes. Each message consists of a 1-byte type identifier followed by
 * a fixed-length payload specific to that message type.
 *
 * @param payload - Hex string containing concatenated messages, with '0x' prefix
 * @returns Array of hex strings, each representing a single message (including type byte)
 * @throws {Error} If an invalid/unknown message type is encountered
 *
 * @example
 * const payload = '0x2100...3300...' // Multiple concatenated messages
 * const messages = extractMessagesFromPayload(payload)
 * // Returns: ['0x21...', '0x33...'] // Individual message bytes
 */
export function extractMessagesFromPayload(payload: `0x${string}`, version: RegistryVersions) {
  const payloadBuffer = Buffer.from(payload.substring(2), "hex");
  const messages: `0x${string}`[] = [];
  let offset = 0;
  // Keep extracting messages while we have enough bytes remaining
  while (offset < payloadBuffer.length) {
    const messageType = payloadBuffer.readUInt8(offset);
    // Pass the buffer slice starting from current offset
    const currentBuffer = payloadBuffer.subarray(offset);
    const messageLength = getCrosschainMessageLength(messageType, currentBuffer, version);
    if (!messageLength) {
      serviceError(`Invalid message type: ${messageType}`);
      break;
    }

    // Extract message bytes including the type byte
    const messageBytes = currentBuffer.subarray(0, messageLength);
    messages.push(`0x${messageBytes.toString("hex")}`);

    // Move offset past this message
    offset += messageLength;
  }
  return messages;
}

/**
 * Generates a unique payload ID by hashing chain IDs and payload bytes
 *
 * @param fromCentrifugeId - The Centrifuge Chain ID of the source chain
 * @param toCentrifugeId - The Centrifuge Chain ID of the destination chain
 * @param payload - The hex-encoded payload bytes
 * @returns The keccak256 hash of the encoded parameters as the payload ID
 */
export function getPayloadId(
  fromCentrifugeId: string,
  toCentrifugeId: string,
  payload: `0x${string}`
) {
  return keccak256(
    encodePacked(
      ["uint16", "uint16", "bytes32"],
      [Number(fromCentrifugeId), Number(toCentrifugeId), keccak256(payload)]
    )
  );
}
