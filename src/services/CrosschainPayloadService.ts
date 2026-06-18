import { eq, type SQL } from "drizzle-orm";
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
export function buildCrosschainPayloadConflictSet(): Record<string, SQL> {
  const set: Record<string, SQL> = {};

  for (const base of PAYLOAD_TIMESTAMP_FACTS_WITH_CHAIN) {
    const pgAt = `${camelToSnake(base)}_at`;
    const pgBlock = `${camelToSnake(base)}_at_block`;
    const pgTx = `${camelToSnake(base)}_at_tx_hash`;
    const pgChain = `${camelToSnake(base)}_at_chain_id`;
    const tsKey = `${base}At`;
    set[`${tsKey}`] = mergeEarliest(PAYLOAD_TABLE, pgAt);
    set[`${tsKey}Block`] = mergeCoalesce(PAYLOAD_TABLE, pgBlock);
    set[`${tsKey}TxHash`] = mergeCoalesce(PAYLOAD_TABLE, pgTx);
    set[`${tsKey}ChainId`] = mergeCoalesce(PAYLOAD_TABLE, pgChain);
  }

  for (const base of PAYLOAD_TIMESTAMP_FACTS) {
    const pgAt = `${camelToSnake(base)}_at`;
    const pgBlock = `${camelToSnake(base)}_at_block`;
    const pgTx = `${camelToSnake(base)}_at_tx_hash`;
    const tsKey = `${base}At`;
    set[`${tsKey}`] = mergeEarliest(PAYLOAD_TABLE, pgAt);
    set[`${tsKey}Block`] = mergeCoalesce(PAYLOAD_TABLE, pgBlock);
    set[`${tsKey}TxHash`] = mergeCoalesce(PAYLOAD_TABLE, pgTx);
  }

  set.poolId = mergeCoalesce(PAYLOAD_TABLE, "pool_id");
  set.tokenId = mergeCoalesce(PAYLOAD_TABLE, "token_id");
  set.rawData = mergeSenderWinsUnlessPlaceholder(
    PAYLOAD_TABLE,
    "raw_data",
    `'${CROSSCHAIN_RAW_DATA_STUB}'`
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
  underpaidAt?: Date | null;
  deliveredAt?: Date | null;
  partiallyFailedAt?: Date | null;
};

/** Minimal message row shape for payload index linkage. */
type MessageRowForPayloadIndex = {
  payloadIndex?: number | null;
  payloadId?: `0x${string}` | null;
};

/** Sender / receive payload events that allocate or target `(payloadId, index)`. */
export type PayloadEventKind = "UnderpaidBatch" | "RepayBatch" | "SendPayload" | "HandlePayload";

/** Result of resolving which payload index an event should upsert. */
export type ResolvePayloadKeyResult =
  | { action: "mutate"; index: number }
  | { action: "create"; index: number }
  | { action: "defer" };

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
 * Highest-index payload row for a `payloadId`.
 * @param rows - All rows for one payload id
 * @returns Row with maximum `index`
 */
function highestPayloadRowAmong(rows: PayloadRowForIndex[]): PayloadRowForIndex | null {
  if (rows.length === 0) return null;
  return rows.reduce((max, r) => (r.index > max.index ? r : max));
}

/**
 * Next index when starting a new send attempt (all prior rows closed).
 * @param rows - All rows for one payload id
 * @returns `0` when empty, else `MAX(index) + 1`
 */
function nextPayloadIndexWhenAllClosed(rows: PayloadRowForIndex[]): number {
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
 * @param options - Defer flag and optional message linkage hint
 * @returns Mutate existing index, create new index, or defer (cross-chain)
 */
export function resolvePayloadKeyForEvent(
  eventKind: PayloadEventKind,
  rows: PayloadRowForIndex[],
  options: { deferAllowed: boolean; messagePayloadIndex?: number | null }
): ResolvePayloadKeyResult {
  const open = pickOpenPayloadRowAmong(rows);

  if (options.messagePayloadIndex != null) {
    const linked = rows.find((r) => r.index === options.messagePayloadIndex);
    if (linked) {
      const senderEvent = eventKind === "UnderpaidBatch" || eventKind === "SendPayload";
      if (isPayloadRowOpen(linked) || senderEvent) {
        return { action: "mutate", index: linked.index };
      }
    }
  }

  switch (eventKind) {
    case "UnderpaidBatch":
      if (rows.length === 0) return { action: "create", index: 0 };
      {
        const unsent = pickLowestUnsentRowAmong(rows);
        if (unsent) return { action: "mutate", index: unsent.index };
      }
      {
        const highest = highestPayloadRowAmong(rows);
        if (highest && isPayloadSent(highest)) return { action: "defer" };
      }
      return { action: "defer" };

    case "RepayBatch":
      if (open) return { action: "mutate", index: open.index };
      return { action: "defer" };

    case "SendPayload":
      if (open) return { action: "mutate", index: open.index };
      if (rows.length === 0) return { action: "create", index: 0 };
      return options.deferAllowed
        ? { action: "defer" }
        : { action: "create", index: nextPayloadIndexWhenAllClosed(rows) };

    case "HandlePayload": {
      const openSent = rows
        .filter((r) => isPayloadRowOpen(r) && r.sentAt != null)
        .sort((a, b) => a.index - b.index);
      if (openSent[0]) return { action: "mutate", index: openSent[0].index };
      if (open) return { action: "mutate", index: open.index };
      return { action: "defer" };
    }

    default: {
      const _exhaustive: never = eventKind;
      return _exhaustive;
    }
  }
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
   * @param options - Defer flag and optional batch message ids for linkage
   * @returns Mutate, create, or defer
   */
  static async resolvePayloadKey(
    context: Context,
    payloadId: `0x${string}`,
    eventKind: PayloadEventKind,
    options: {
      deferAllowed: boolean;
      messageIds?: readonly `0x${string}`[];
    }
  ): Promise<ResolvePayloadKeyResult> {
    const rows = await CrosschainPayloadService.loadAllForPayloadId(context, payloadId);
    const rowData = rows.map((r) => r.read());

    let messagePayloadIndex: number | null = null;
    if (options.messageIds?.length) {
      const byId = await CrosschainMessageService.loadCrosschainMessagesByMessageIds(
        context,
        options.messageIds
      );
      const flat = [...byId.values()].flat().map((r) => r.read());
      messagePayloadIndex = payloadIndexFromMessages(flat);
    }

    serviceLog(
      "CrosschainPayload resolvePayloadKey",
      expandInlineObject({ payloadId, eventKind, messagePayloadIndex, rowCount: rowData.length })
    );

    return resolvePayloadKeyForEvent(eventKind, rowData, {
      deferAllowed: options.deferAllowed,
      messagePayloadIndex,
    });
  }

  /**
   * Upserts fact columns and recomputes status via SQL CASE (multichain-safe).
   * @param context - Ponder context
   * @param event - Source event
   * @param key - Payload primary key
   * @param facts - Fact fields (status derived on conflict)
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
    const row = {
      ...NULL_CROSSCHAIN_PAYLOAD_FACTS,
      ...facts,
      ...key,
      rawData: facts.rawData ?? CROSSCHAIN_RAW_DATA_STUB,
      fromCentrifugeId: facts.fromCentrifugeId ?? "0",
      toCentrifugeId: facts.toCentrifugeId ?? "0",
      status: facts.status ?? "Underpaid",
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
        set: conflictSet as unknown as Partial<typeof row>,
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
