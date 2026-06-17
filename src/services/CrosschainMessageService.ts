import { CrosschainMessage } from "ponder:schema";
import { Service, type DataWithoutDefaults, type ReadOnlyContext } from "./Service";
import { expandInlineObject, serviceError, serviceLog } from "../helpers/logger";
import { encodePacked, keccak256 } from "viem";
import { Event, Context } from "ponder:registry";
import { RegistryVersions } from "../chains";
import { and, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import {
  mergeClearOnExecute,
  mergeCoalesce,
  mergeEarliest,
  mergeSenderWins,
  mergeSenderWinsUnlessPlaceholder,
} from "../helpers/upsertMerge";
import { messageStatusSetSql } from "./crosschainStatusSql";
import { getPayloadSendAnchorAt } from "./CrosschainPayloadService";

const MESSAGE_TABLE = "crosschain_message";

/** Null timestamp + chain-id facts for merge SET excluded.* gates. */
function nullTimestamperWithChain<N extends string>(fieldName: N) {
  return {
    [`${fieldName}At`]: null,
    [`${fieldName}AtBlock`]: null,
    [`${fieldName}AtTxHash`]: null,
    [`${fieldName}AtChainId`]: null,
  } as Record<string, null>;
}

/**
 * Default status for first insert of a crosschain message (no facts yet).
 * @param hasPrepared - Whether preparedAt is set on insert
 * @param hasPayload - Whether payloadId is set on insert
 * @returns Initial status string
 */
export function defaultCrosschainMessageStatus(
  hasPrepared: boolean,
  hasPayload: boolean
): "AwaitingBatchDelivery" {
  void hasPrepared;
  void hasPayload;
  return "AwaitingBatchDelivery";
}

/** Insert-only sentinel for partial message upserts (must not win on conflict). */
export const CROSSCHAIN_MESSAGE_TYPE_STUB = "_Stub";
/** Insert-only sentinel for partial message/payload upserts (must not win on conflict). */
export const CROSSCHAIN_RAW_DATA_STUB = "0x";

/** Null fact columns referenced in message merge SET (Ponder excluded.* gate). */
export const NULL_CROSSCHAIN_MESSAGE_FACTS = {
  payloadId: null,
  payloadIndex: null,
  poolId: null,
  tokenId: null,
  failReason: null,
  executedAtChainId: null,
  ...nullTimestamperWithChain("prepared"),
  ...nullTimestamperWithChain("failed"),
  ...nullTimestamperWithChain("executed"),
};

const MESSAGE_TIMESTAMP_FACTS = ["prepared", "failed", "executed"] as const;

/**
 * Converts camelCase to snake_case for SQL column names.
 * @param s - camelCase string
 * @returns snake_case string
 */
function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Builds ON CONFLICT SET for crosschain_message fact merge + derived status.
 * @returns Conflict set map for Drizzle upsert
 */
export function buildCrosschainMessageConflictSet(): Record<string, SQL> {
  const set: Record<string, SQL> = {};

  for (const base of MESSAGE_TIMESTAMP_FACTS) {
    const pgAt = `${camelToSnake(base)}_at`;
    const pgBlock = `${camelToSnake(base)}_at_block`;
    const pgTx = `${camelToSnake(base)}_at_tx_hash`;
    const pgChain = `${camelToSnake(base)}_at_chain_id`;
    const tsKey = `${base}At`;
    set[`${tsKey}`] = mergeEarliest(MESSAGE_TABLE, pgAt);
    set[`${tsKey}Block`] = mergeCoalesce(MESSAGE_TABLE, pgBlock);
    set[`${tsKey}TxHash`] = mergeCoalesce(MESSAGE_TABLE, pgTx);
    set[`${tsKey}ChainId`] = mergeCoalesce(MESSAGE_TABLE, pgChain);
  }

  set.payloadId = mergeCoalesce(MESSAGE_TABLE, "payload_id");
  set.payloadIndex = mergeCoalesce(MESSAGE_TABLE, "payload_index");
  set.poolId = mergeCoalesce(MESSAGE_TABLE, "pool_id");
  set.tokenId = mergeCoalesce(MESSAGE_TABLE, "token_id");
  set.rawData = mergeSenderWinsUnlessPlaceholder(
    MESSAGE_TABLE,
    "raw_data",
    `'${CROSSCHAIN_RAW_DATA_STUB}'`
  );
  set.data = mergeSenderWins(MESSAGE_TABLE, "data");
  set.messageType = mergeSenderWinsUnlessPlaceholder(
    MESSAGE_TABLE,
    "message_type",
    `'${CROSSCHAIN_MESSAGE_TYPE_STUB}'`
  );
  set.hash = mergeCoalesce(MESSAGE_TABLE, "hash");
  set.fromCentrifugeId = mergeCoalesce(MESSAGE_TABLE, "from_centrifuge_id");
  set.toCentrifugeId = mergeCoalesce(MESSAGE_TABLE, "to_centrifuge_id");
  set.failedAt = mergeClearOnExecute(MESSAGE_TABLE, "failed_at");
  set.failedAtBlock = mergeClearOnExecute(MESSAGE_TABLE, "failed_at_block");
  set.failedAtTxHash = mergeClearOnExecute(MESSAGE_TABLE, "failed_at_tx_hash");
  set.failedAtChainId = mergeClearOnExecute(MESSAGE_TABLE, "failed_at_chain_id");
  set.failReason = mergeClearOnExecute(MESSAGE_TABLE, "fail_reason");
  set.status = messageStatusSetSql();

  return set;
}

/** Minimal message row shape for send-target selection. */
export type MessageRowForPick = {
  index: number;
  preparedAt: Date | null;
  payloadId?: `0x${string}` | null;
  payloadIndex?: number | null;
  failedAt?: Date | null;
  executedAt?: Date | null;
};

/** Row accessor used by pickSendTarget. */
export type MessageRowRef = { read: () => MessageRowForPick };

/** Fields required for FIFO ordering of message receive entries. */
type MessageReceiveFifoFields = {
  status: "execute" | "fail";
  receivedAt: Date;
  receivedAtBlock: number;
};

/**
 * Send anchor timestamp for a committed message row (latest send-side fact before receive).
 * @param row - Message row data
 * @param payload - Optional linked payload row for batch-linked messages
 * @returns Anchor time or null
 */
export function getMessageSendAnchorAt(
  row: {
    preparedAt: Date | null;
    payloadId?: `0x${string}` | null;
    payloadIndex?: number | null;
  },
  payload?: { sentAt: Date | null; underpaidAt: Date | null } | null
): Date | null {
  if (row.payloadId && payload) return getPayloadSendAnchorAt(payload);
  return row.preparedAt ?? null;
}

/**
 * Causal ordering: receive must not precede the send anchor.
 * @param receivedAt - Receive timestamp
 * @param sendAnchorAt - Send anchor timestamp
 * @returns Whether causal rule passes
 */
export function passesCausalOrder(receivedAt: Date, sendAnchorAt: Date | null): boolean {
  if (!sendAnchorAt) return false;
  return receivedAt.getTime() >= sendAnchorAt.getTime();
}

/**
 * Picks the committed message row index for a receive fact.
 * @param rows - Committed rows for one message id
 * @param status - execute or fail
 * @param payloadAnchorFor - Optional resolver for linked payload send anchors
 * @returns Target row or null
 */
export function pickSendTarget(
  rows: MessageRowRef[],
  status: "execute" | "fail",
  payloadAnchorFor?: (
    row: MessageRowForPick
  ) => { sentAt: Date | null; underpaidAt: Date | null } | null | undefined
): MessageRowRef | null {
  const withAnchor = rows.filter((r) => {
    const d = r.read();
    return getMessageSendAnchorAt(d, payloadAnchorFor?.(d) ?? null) != null;
  });
  if (withAnchor.length === 0) return null;

  if (status === "fail") {
    const open = withAnchor.filter((r) => r.read().executedAt == null);
    if (open.length === 0) return null;
    return open.reduce((min, r) => (r.read().index < min.read().index ? r : min));
  }

  const retryFailed = withAnchor.filter((r) => {
    const d = r.read();
    return d.failedAt != null && d.executedAt == null;
  });
  if (retryFailed.length > 0) {
    return retryFailed.reduce((min, r) => (r.read().index < min.read().index ? r : min));
  }

  const open = withAnchor.filter((r) => {
    const d = r.read();
    return d.executedAt == null && d.failedAt == null;
  });
  if (open.length === 0) return null;
  return open.reduce((min, r) => (r.read().index < min.read().index ? r : min));
}

/**
 * FIFO sort for message receive work list (fail before execute at equal time).
 * @param entries - Entries to sort
 * @returns Sorted copy
 */
export function sortMessageQueueFifo<T extends MessageReceiveFifoFields>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const ta = a.receivedAt.getTime();
    const tb = b.receivedAt.getTime();
    if (ta !== tb) return ta - tb;
    if (a.status === "fail" && b.status === "execute") return -1;
    if (a.status === "execute" && b.status === "fail") return 1;
    return a.receivedAtBlock - b.receivedAtBlock;
  });
}

/**
 * Service class for managing CrosschainMessage entities.
 *
 * This service handles operations related to CrosschainMessage entities,
 * including creation, updating, and querying.
 *
 * @extends {Service<typeof CrosschainMessage>}
 */
export class CrosschainMessageService extends Service<typeof CrosschainMessage> {
  static readonly entityTable = CrosschainMessage;
  static readonly entityName = "CrosschainMessage";

  /**
   * Upserts fact columns and recomputes status via SQL CASE (multichain-safe).
   * @param context - Ponder context
   * @param event - Source event for created/updated defaults
   * @param key - Message primary key
   * @param facts - Fact fields to merge (status is derived, not set here)
   * @returns Service instance for the upserted row
   */
  static async upsertFacts(
    context: Context,
    event: Extract<Event, { transaction: { hash: `0x${string}` } }>,
    key: { id: `0x${string}`; index: number },
    facts: Partial<DataWithoutDefaults<typeof CrosschainMessage>>
  ): Promise<CrosschainMessageService> {
    serviceLog(
      "CrosschainMessage upsertFacts",
      expandInlineObject({ id: key.id, index: key.index })
    );
    const hasPrepared = facts.preparedAt != null;
    const hasPayload = facts.payloadId != null;
    const status =
      facts.status ??
      defaultCrosschainMessageStatus(hasPrepared, hasPayload);
    const row = {
      ...NULL_CROSSCHAIN_MESSAGE_FACTS,
      ...facts,
      ...key,
      messageType: facts.messageType ?? CROSSCHAIN_MESSAGE_TYPE_STUB,
      hash: facts.hash ?? (`0x${"00".repeat(32)}` as `0x${string}`),
      rawData: facts.rawData ?? CROSSCHAIN_RAW_DATA_STUB,
      fromCentrifugeId: facts.fromCentrifugeId ?? "0",
      toCentrifugeId: facts.toCentrifugeId ?? "0",
      status,
      createdAt: new Date(Number(event.block.timestamp) * 1000),
      createdAtBlock: Number(event.block.number),
      createdAtTxHash: event.transaction.hash,
    };

    const conflictSet = buildCrosschainMessageConflictSet();
    const [entity] = await context.db.sql
      .insert(CrosschainMessage)
      .values(row)
      .onConflictDoUpdate({
        target: [CrosschainMessage.id, CrosschainMessage.index],
        set: conflictSet as unknown as Partial<typeof row>,
      })
      .returning();

    if (!entity) throw new Error(`CrosschainMessage upsertFacts failed for ${key.id}`);
    return new CrosschainMessageService(
      CrosschainMessage,
      "CrosschainMessage",
      context,
      entity
    );
  }

  /**
   * Batch upsert fact rows (each row gets its own conflict merge + status CASE).
   * @param context - Ponder context
   * @param event - Source event
   * @param rows - Rows with keys and facts
   * @returns Upserted service instances
   */
  static async upsertFactsMany(
    context: Context,
    event: Extract<Event, { transaction: { hash: `0x${string}` } }>,
    rows: Array<
      { id: `0x${string}`; index: number } & Partial<DataWithoutDefaults<typeof CrosschainMessage>>
    >
  ): Promise<CrosschainMessageService[]> {
    const results: CrosschainMessageService[] = [];
    for (const row of rows) {
      const { id, index, ...facts } = row;
      results.push(await CrosschainMessageService.upsertFacts(context, event, { id, index }, facts));
    }
    return results;
  }

  /**
   * Groups rows by message `id`, each group sorted by `index` (for in-memory use after a batched query).
   */
  static groupRowsByMessageId(rows: CrosschainMessageService[]) {
    serviceLog(`CrosschainMessage groupRowsByMessageId count=${rows.length}`);
    const map = new Map<`0x${string}`, CrosschainMessageService[]>();
    for (const row of rows) {
      const id = row.read().id as `0x${string}`;
      const list = map.get(id) ?? [];
      list.push(row);
      map.set(id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.read().index - b.read().index);
    }
    return map;
  }

  /**
   * Next message index for a message id (`MAX(index) + 1` on committed rows only).
   * @param context - Ponder context
   * @param messageId - Message id
   * @returns Next index (0 when none exist)
   */
  static async nextMessageIndex(
    context: Context,
    messageId: `0x${string}`
  ): Promise<number> {
    const db = context.db.sql;
    const [result] = await db
      .select({ maxIndex: sql<number>`coalesce(max(${CrosschainMessage.index}), -1)::int` })
      .from(CrosschainMessage)
      .where(eq(CrosschainMessage.id, messageId));
    return (result?.maxIndex ?? -1) + 1;
  }

  /**
   * First prepared row that is `AwaitingBatchDelivery` with no `payloadId` (`rows` sorted by index).
   */
  static getFirstUnlinkedAwaiting(rows: CrosschainMessageService[] | undefined) {
    serviceLog(`CrosschainMessage getFirstUnlinkedAwaiting rows=${rows?.length ?? 0}`);
    if (!rows) return null;
    for (const row of rows) {
      const d = row.read();
      if (d.status === "AwaitingBatchDelivery" && d.payloadId == null && d.preparedAt != null) {
        return row;
      }
    }
    return null;
  }

  /**
   * Aggregates a single poolId and tokenId from message rows (errors when multiple pools).
   * @param rows - Message service rows or minimal `{ poolId, tokenId }` shapes
   * @returns Tuple of poolId and tokenId, or `[null, null]` on multi-pool conflict
   */
  static aggregatePoolAndTokenFromRows(
    rows: readonly { read: () => { poolId: bigint | null; tokenId: `0x${string}` | null } }[]
  ): [poolId: bigint | null, tokenId: `0x${string}` | null] {
    serviceLog(
      "CrosschainMessage aggregatePoolAndTokenFromRows",
      expandInlineObject({ rowCount: rows.length })
    );
    const data = rows.map((row) => row.read());
    const poolIdSet = new Set<bigint>();
    const tokenIdSet = new Set<`0x${string}`>();
    for (const { poolId, tokenId } of data) {
      if (poolId != null) poolIdSet.add(poolId);
      if (tokenId != null) tokenIdSet.add(tokenId);
    }
    const poolIds = Array.from(poolIdSet);
    const tokenIds = Array.from(tokenIdSet);
    if (poolIds.length > 1) {
      serviceError("Multiple pools found among messages");
      return [null, null];
    }
    return [poolIds.pop() ?? null, tokenIds.pop() ?? null];
  }

  /**
   * One query: all **CrosschainMessage** rows whose primary-key `id` is in `messageIds` (deduped),
   * returned as `Map<messageId, rows[]>` (each list sorted by `index`).
   */
  static async loadCrosschainMessagesByMessageIds(
    context: Context | ReadOnlyContext,
    messageIds: readonly `0x${string}`[]
  ) {
    const unique = [...new Set(messageIds)];
    serviceLog(
      "CrosschainMessage loadCrosschainMessagesByMessageIds",
      expandInlineObject({ count: unique.length })
    );
    if (unique.length === 0) return new Map<`0x${string}`, CrosschainMessageService[]>();
    const rows = (await CrosschainMessageService.query(context, {
      id_in: unique,
      _sort: [
        { field: "id", direction: "asc" },
        { field: "index", direction: "asc" },
      ],
    })) as CrosschainMessageService[];
    return CrosschainMessageService.groupRowsByMessageId(rows);
  }

  /**
   * Gets the first message from the awaiting batch delivery queue for a given message ID
   * @param context - The database and client context
   * @param messageId - The ID of the message to get from the queue
   * @returns The first message from the queue or null if no message is found
   */
  static async getFromAwaitingBatchDeliveryQueue(context: Context, messageId: `0x${string}`) {
    serviceLog(
      "CrosschainMessage getFromAwaitingBatchDeliveryQueue",
      expandInlineObject({ messageId })
    );
    const crosschainMessages = (await CrosschainMessageService.query(context, {
      id: messageId,
      status: "AwaitingBatchDelivery",
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainMessageService[];
    if (crosschainMessages.length === 0) return null;
    return crosschainMessages.shift()!;
  }

  /**
   * Gets the first message from the awaiting batch delivery or failed queue for a given message ID
   * @param context - The database and client context
   * @param messageId - The ID of the message to get from the queue
   * @returns The first message from the queue or null if no message is found
   */
  static async getFromAwaitingBatchDeliveryOrFailedQueue(
    context: Context,
    messageId: `0x${string}`
  ) {
    serviceLog(
      "CrosschainMessage getFromAwaitingBatchDeliveryOrFailedQueue",
      expandInlineObject({ messageId })
    );
    const crosschainMessages = (await CrosschainMessageService.query(context, {
      id: messageId,
      status_in: ["AwaitingBatchDelivery", "Failed"],
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainMessageService[];
    if (crosschainMessages.length === 0) return null;
    return crosschainMessages.shift()!;
  }

  /**
   * Counts the number of failed messages for a given message ID
   * @param context - The database and client context
   * @param messageId - The ID of the message to count failed messages for
   * @returns The number of failed messages
   */
  static async countPayloadFailedMessages(
    context: Context,
    payloadId: `0x${string}`,
    payloadIndex: number
  ) {
    serviceLog(
      "CrosschainMessage countPayloadFailedMessages",
      expandInlineObject({ payloadId, payloadIndex })
    );
    return await CrosschainMessageService.count(context, {
      payloadId,
      payloadIndex,
      status: "Failed",
    });
  }

  /**
   * Counts the number of executed messages for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to count executed messages for
   * @returns The number of executed messages
   */
  static async countPayloadExecutedMessages(
    context: Context,
    payloadId: `0x${string}`,
    payloadIndex: number
  ) {
    serviceLog(
      "CrosschainMessage countPayloadExecutedMessages",
      expandInlineObject({ payloadId, payloadIndex })
    );
    const db = context.db.sql;
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(CrosschainMessage)
      .where(
        and(
          eq(CrosschainMessage.payloadId, payloadId),
          eq(CrosschainMessage.payloadIndex, payloadIndex),
          isNotNull(CrosschainMessage.executedAt)
        )
      );
    return result?.count ?? 0;
  }

  /**
   * Counts the number of messages for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to count messages for
   * @returns The number of messages
   */
  static async countPayloadMessages(
    context: Context,
    payloadId: `0x${string}`,
    payloadIndex: number
  ) {
    serviceLog(
      "CrosschainMessage countPayloadMessages",
      expandInlineObject({ payloadId, payloadIndex })
    );
    return await CrosschainMessageService.count(context, {
      payloadId,
      payloadIndex,
    });
  }

  /**
   * True when every message for this payload row is executed. Uses two aggregate counts (in parallel)
   * instead of loading all message rows.
   */
  static async checkPayloadFullyExecuted(
    context: Context,
    payloadId: `0x${string}`,
    payloadIndex: number
  ) {
    serviceLog(
      "CrosschainMessage checkPayloadFullyExecuted",
      expandInlineObject({ payloadId, payloadIndex })
    );
    const [total, executed] = await Promise.all([
      CrosschainMessageService.countPayloadMessages(context, payloadId, payloadIndex),
      CrosschainMessageService.countPayloadExecutedMessages(context, payloadId, payloadIndex),
    ]);
    const fullyExecuted = total > 0 && executed === total;
    serviceLog(
      "CrosschainMessage checkPayloadFullyExecuted result",
      expandInlineObject({ fullyExecuted, total, executed })
    );
    return fullyExecuted;
  }

  /**
   * Links outstanding messages to a payload
   * @param context - The database and client context
   * @param event - The event that links the messages to the payload
   * @param messageIds - The IDs of the messages to link to the payload
   * @param payloadId - The ID of the payload to link the messages to
   * @param payloadIndex - The index of the payload to link the messages to
   */
  static async linkMessagesToPayload(
    context: Context,
    event: Extract<Event, { transaction: { hash: `0x${string}` } }>,
    messageIds: `0x${string}`[],
    payloadId: `0x${string}`,
    payloadIndex: number
  ): Promise<[poolId: bigint | null, tokenId: `0x${string}` | null]> {
    serviceLog(
      "CrosschainMessage linkMessagesToPayload",
      expandInlineObject({ payloadId, payloadIndex, messageCount: messageIds.length })
    );
    const uniqueIds = [...new Set(messageIds)];
    const unlinkedRows = (
      uniqueIds.length === 0
        ? []
        : ((await CrosschainMessageService.query(context, {
            id_in: uniqueIds,
            payloadId: null,
            payloadIndex: null,
            _sort: [
              { field: "id", direction: "asc" },
              { field: "index", direction: "asc" },
            ],
          })) as CrosschainMessageService[])
    ).filter((row) => row.read().preparedAt != null);

    const queueById = CrosschainMessageService.groupRowsByMessageId(unlinkedRows);

    const linkedRows: CrosschainMessageService[] = [];
    for (const messageId of messageIds) {
      const q = queueById.get(messageId);
      const crosschainMessage = q?.shift();
      if (!crosschainMessage) continue;
      const { index } = crosschainMessage.read();
      await CrosschainMessageService.upsertFacts(context, event, { id: messageId, index }, {
        payloadId,
        payloadIndex,
      });
      linkedRows.push(crosschainMessage);
    }
    return CrosschainMessageService.aggregatePoolAndTokenFromRows(linkedRows);
  }
}

const CrosschainMessageType = {
  // V3 Message Types
  v3: {
    /// @dev Placeholder for null message type
    _Invalid: undefined,
    // -- Pool independent messages
    ScheduleUpgrade: 33,
    CancelUpgrade: 33,
    RecoverTokens: 161,
    RegisterAsset: 18,
    _Placeholder5: 0,
    _Placeholder6: 0,
    _Placeholder7: 0,
    _Placeholder8: 0,
    _Placeholder9: 0,
    _Placeholder10: 0,
    _Placeholder11: 0,
    _Placeholder12: 0,
    _Placeholder13: 0,
    _Placeholder14: 0,
    _Placeholder15: 0,
    // -- Pool dependent messages
    NotifyPool: 9,
    NotifyShareClass: 250,
    NotifyPricePoolPerShare: 49,
    NotifyPricePoolPerAsset: 65,
    NotifyShareMetadata: 185,
    UpdateShareHook: 57,
    InitiateTransferShares: 91,
    ExecuteTransferShares: 73,
    UpdateRestriction: dynamicLengthDecoder(25),
    UpdateContract: dynamicLengthDecoder(57),
    UpdateVault: 74,
    UpdateBalanceSheetManager: 42,
    UpdateHoldingAmount: 91,
    UpdateShares: 59,
    MaxAssetPriceAge: 49,
    MaxSharePriceAge: 33,
    Request: dynamicLengthDecoder(41),
    RequestCallback: dynamicLengthDecoder(41),
    SetRequestManager: 73,
  } as const,
  // V3_1 Message Types
  v3_1: {
    /// @dev Placeholder for null message type
    _Invalid: undefined,
    // -- Pool independent messages
    ScheduleUpgrade: 33,
    CancelUpgrade: 33,
    RecoverTokens: 161,
    RegisterAsset: 18,
    SetPoolAdapters: setPoolAdaptersLengthDecoder,
    // -- Pool dependent messages
    NotifyPool: 9,
    NotifyShareClass: 250,
    NotifyPricePoolPerShare: 49,
    NotifyPricePoolPerAsset: 65,
    NotifyShareMetadata: 185,
    UpdateShareHook: 57,
    InitiateTransferShares: 107,
    ExecuteTransferShares: 89,
    UpdateRestriction: dynamicLengthDecoder(41),
    UpdateVault: 90,
    UpdateBalanceSheetManager: 42,
    UpdateGatewayManager: 42,
    UpdateHoldingAmount: 107,
    UpdateShares: 75,
    SetMaxAssetPriceAge: 49,
    SetMaxSharePriceAge: 33,
    Request: dynamicLengthDecoder(57),
    RequestCallback: dynamicLengthDecoder(57),
    SetRequestManager: 41,
    TrustedContractUpdate: dynamicLengthDecoder(73),
    UntrustedContractUpdate: dynamicLengthDecoder(105),
  } as const,
} as const;

type BufferDecoderEntry<T = unknown> = [decoder: (_m: Buffer) => T, length: number];

const MessageDecoders = {
  bool: [(m) => m.readUInt8() !== 0, 1],
  uint8: [(m) => m.readUInt8(), 1],
  uint16: [(m) => m.readUInt16BE(), 2],
  uint64: [(m) => m.readBigUInt64BE().toString(), 8],
  uint128: [
    (m) => {
      const high = m.readBigUInt64BE(0); // Bytes 0-7 (upper 64 bits)
      const low = m.readBigUInt64BE(8); // Bytes 8-15 (lower 64 bits)
      return ((high << 64n) | low).toString();
    },
    16,
  ],
  uint256: [
    (m) => {
      const highest = m.readBigUInt64BE(0); // Bytes 0-7 (upper 64 bits)
      const high = m.readBigUInt64BE(8); // Bytes 8-15 (upper 64 bits)
      const low = m.readBigUInt64BE(16); // Bytes 16-23 (lower 64 bits)
      const lowest = m.readBigUInt64BE(24); // Bytes 24-31 (lower 64 bits)
      return ((highest << 192n) | (high << 128n) | (low << 64n) | lowest).toString();
    },
    32,
  ],
  bytes16: [(m) => `0x${m.toString("hex").padEnd(32, "0")}`, 16],
  bytes32: [(m) => `0x${m.toString("hex").padEnd(64, "0")}`, 32],
  string: [(m) => m.toString("utf-8").replace(/\0+$/, ""), 0],
  bytes: [(m) => `0x${m.toString("hex")}`, 0],
} as const satisfies Record<string, BufferDecoderEntry>;

interface DecoderConfig {
  name: string;
  decoder: keyof typeof MessageDecoders;
}

// Type mapping for decoder return types - derived from MessageDecoders
type DecoderReturnTypes = {
  [K in keyof typeof MessageDecoders]: ReturnType<(typeof MessageDecoders)[K][0]>;
};

// Helper type to extract decoder config from a specific version
type MessageDecoderConfig<T extends keyof typeof messageDecoders> = (typeof messageDecoders)[T];

// Helper type to map a single decoder config to its return type
type DecoderConfigToType<C extends DecoderConfig> = C extends { decoder: infer D }
  ? D extends keyof DecoderReturnTypes
    ? DecoderReturnTypes[D]
    : never
  : never;

// Type that maps message type names to their decoded parameter types
// Generic over version index to work with both V3 and V3_1
type DecodedMessageTypes<T extends keyof typeof messageDecoders> = {
  [K in keyof MessageDecoderConfig<T>]: MessageDecoderConfig<T>[K] extends readonly DecoderConfig[]
    ? {
        [P in MessageDecoderConfig<T>[K][number] as P["name"]]: DecoderConfigToType<P>;
      }
    : never;
};

/**
 * Distributive helper over version union: when V is "v3" | "v3_1", produces
 * DecodedMessageTypes<"v3">[T] | DecodedMessageTypes<"v3_1">[T] (all possible combinations).
 */
type DecodedMessageResult<
  V extends keyof typeof messageDecoders,
  T extends keyof (typeof messageDecoders)[V],
> = V extends keyof typeof messageDecoders ? DecodedMessageTypes<V>[T] : never;

const messageDecoders = {
  // V3 Message Decoders
  v3: {
    _Invalid: [],
    ScheduleUpgrade: [{ name: "target", decoder: "bytes32" }],
    CancelUpgrade: [{ name: "target", decoder: "bytes32" }],
    RecoverTokens: [
      { name: "target", decoder: "bytes32" },
      { name: "token", decoder: "bytes32" },
      { name: "tokenId", decoder: "uint256" },
      { name: "to", decoder: "bytes32" },
      { name: "amount", decoder: "uint256" },
    ],
    RegisterAsset: [
      { name: "assetId", decoder: "uint128" },
      { name: "decimals", decoder: "uint8" },
    ],
    _Placeholder5: [],
    _Placeholder6: [],
    _Placeholder7: [],
    _Placeholder8: [],
    _Placeholder9: [],
    _Placeholder10: [],
    _Placeholder11: [],
    _Placeholder12: [],
    _Placeholder13: [],
    _Placeholder14: [],
    _Placeholder15: [],
    NotifyPool: [{ name: "poolId", decoder: "uint64" }],
    NotifyShareClass: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "name", decoder: "string" },
      { name: "symbol", decoder: "bytes32" },
      { name: "decimals", decoder: "uint8" },
      { name: "salt", decoder: "bytes32" },
      { name: "hook", decoder: "bytes32" },
    ],
    NotifyPricePoolPerShare: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "price", decoder: "uint128" },
      { name: "timestamp", decoder: "uint64" },
    ],
    NotifyPricePoolPerAsset: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "assetId", decoder: "uint128" },
      { name: "price", decoder: "uint128" },
      { name: "timestamp", decoder: "uint64" },
    ],
    NotifyShareMetadata: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "name", decoder: "string" },
      { name: "symbol", decoder: "bytes32" },
    ],
    UpdateShareHook: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "hook", decoder: "bytes32" },
    ],
    InitiateTransferShares: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "centrifugeId", decoder: "uint16" },
      { name: "receiver", decoder: "bytes32" },
      { name: "amount", decoder: "uint128" },
      { name: "extraGasLimit", decoder: "uint128" },
    ],
    ExecuteTransferShares: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "receiver", decoder: "bytes32" },
      { name: "amount", decoder: "uint128" },
    ],
    UpdateRestriction: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "payload", decoder: "bytes" }, // Dynamic length
    ],
    UpdateContract: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "target", decoder: "bytes32" },
      { name: "payload", decoder: "bytes" }, // Dynamic length
    ],
    UpdateVault: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "assetId", decoder: "uint128" },
      { name: "vaultOrFactory", decoder: "bytes32" },
      { name: "kind", decoder: "uint8" },
    ],
    UpdateBalanceSheetManager: [
      { name: "poolId", decoder: "uint64" },
      { name: "who", decoder: "bytes32" },
      { name: "canManage", decoder: "bool" },
    ],
    UpdateHoldingAmount: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "assetId", decoder: "uint128" },
      { name: "amount", decoder: "uint128" },
      { name: "pricePerUnit", decoder: "uint128" },
      { name: "timestamp", decoder: "uint64" },
      { name: "isIncrease", decoder: "bool" },
      { name: "isSnapshot", decoder: "bool" },
      { name: "nonce", decoder: "uint64" },
    ],
    UpdateShares: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "shares", decoder: "uint128" },
      { name: "timestamp", decoder: "uint64" },
      { name: "isIssuance", decoder: "bool" },
      { name: "isSnapshot", decoder: "bool" },
      { name: "nonce", decoder: "uint64" },
    ],
    MaxAssetPriceAge: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "assetId", decoder: "uint128" },
      { name: "maxPriceAge", decoder: "uint64" },
    ],
    MaxSharePriceAge: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "maxPriceAge", decoder: "uint64" },
    ],
    Request: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "assetId", decoder: "uint128" },
      { name: "payload", decoder: "bytes" }, // Dynamic length
    ],
    RequestCallback: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "assetId", decoder: "uint128" },
      { name: "payload", decoder: "bytes" }, // Dynamic length
    ],
    SetRequestManager: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "assetId", decoder: "uint128" },
      { name: "manager", decoder: "bytes32" },
    ],
  },
  // V3_1 Message Decoders
  v3_1: {
    _Invalid: [],
    ScheduleUpgrade: [{ name: "target", decoder: "bytes32" }],
    CancelUpgrade: [{ name: "target", decoder: "bytes32" }],
    RecoverTokens: [
      { name: "target", decoder: "bytes32" },
      { name: "token", decoder: "bytes32" },
      { name: "tokenId", decoder: "uint256" },
      { name: "to", decoder: "bytes32" },
      { name: "amount", decoder: "uint256" },
    ],
    RegisterAsset: [
      { name: "assetId", decoder: "uint128" },
      { name: "decimals", decoder: "uint8" },
    ],
    SetPoolAdapters: [
      { name: "poolId", decoder: "uint64" },
      { name: "threshold", decoder: "uint8" },
      { name: "recoveryIndex", decoder: "uint8" },
      { name: "adapterList", decoder: "bytes" }, // Dynamic length - array of bytes32
    ],
    NotifyPool: [{ name: "poolId", decoder: "uint64" }],
    NotifyShareClass: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "name", decoder: "string" },
      { name: "symbol", decoder: "bytes32" },
      { name: "decimals", decoder: "uint8" },
      { name: "salt", decoder: "bytes32" },
      { name: "hook", decoder: "bytes32" },
    ],
    NotifyPricePoolPerShare: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "price", decoder: "uint128" },
      { name: "timestamp", decoder: "uint64" },
    ],
    NotifyPricePoolPerAsset: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "assetId", decoder: "uint128" },
      { name: "price", decoder: "uint128" },
      { name: "timestamp", decoder: "uint64" },
    ],
    NotifyShareMetadata: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "name", decoder: "string" },
      { name: "symbol", decoder: "bytes32" },
    ],
    UpdateShareHook: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "hook", decoder: "bytes32" },
    ],
    InitiateTransferShares: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "centrifugeId", decoder: "uint16" },
      { name: "receiver", decoder: "bytes32" },
      { name: "amount", decoder: "uint128" },
      { name: "remoteExtraGasLimit", decoder: "uint128" },
      { name: "extraGasLimit", decoder: "uint128" },
    ],
    ExecuteTransferShares: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "receiver", decoder: "bytes32" },
      { name: "amount", decoder: "uint128" },
      { name: "extraGasLimit", decoder: "uint128" },
    ],
    UpdateRestriction: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "extraGasLimit", decoder: "uint128" },
      { name: "payload", decoder: "bytes" }, // Dynamic length
    ],
    UpdateVault: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "assetId", decoder: "uint128" },
      { name: "vaultOrFactory", decoder: "bytes32" },
      { name: "kind", decoder: "uint8" },
      { name: "extraGasLimit", decoder: "uint128" },
    ],
    UpdateBalanceSheetManager: [
      { name: "poolId", decoder: "uint64" },
      { name: "who", decoder: "bytes32" },
      { name: "canManage", decoder: "bool" },
    ],
    UpdateGatewayManager: [
      { name: "poolId", decoder: "uint64" },
      { name: "who", decoder: "bytes32" },
      { name: "canManage", decoder: "bool" },
    ],
    UpdateHoldingAmount: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "assetId", decoder: "uint128" },
      { name: "amount", decoder: "uint128" },
      { name: "pricePoolPerAsset", decoder: "uint128" },
      { name: "timestamp", decoder: "uint64" },
      { name: "isIncrease", decoder: "bool" },
      { name: "isSnapshot", decoder: "bool" },
      { name: "nonce", decoder: "uint64" },
      { name: "extraGasLimit", decoder: "uint128" },
    ],
    UpdateShares: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "shares", decoder: "uint128" },
      { name: "timestamp", decoder: "uint64" },
      { name: "isIssuance", decoder: "bool" },
      { name: "isSnapshot", decoder: "bool" },
      { name: "nonce", decoder: "uint64" },
      { name: "extraGasLimit", decoder: "uint128" },
    ],
    SetMaxAssetPriceAge: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "assetId", decoder: "uint128" },
      { name: "maxPriceAge", decoder: "uint64" },
    ],
    SetMaxSharePriceAge: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "maxPriceAge", decoder: "uint64" },
    ],
    Request: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "assetId", decoder: "uint128" },
      { name: "extraGasLimit", decoder: "uint128" },
      { name: "payload", decoder: "bytes" }, // Dynamic length
    ],
    RequestCallback: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "assetId", decoder: "uint128" },
      { name: "extraGasLimit", decoder: "uint128" },
      { name: "payload", decoder: "bytes" }, // Dynamic length
    ],
    SetRequestManager: [
      { name: "poolId", decoder: "uint64" },
      { name: "manager", decoder: "bytes32" },
    ],
    TrustedContractUpdate: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "target", decoder: "bytes32" },
      { name: "extraGasLimit", decoder: "uint128" },
      { name: "payload", decoder: "bytes" }, // Dynamic length
    ],
    UntrustedContractUpdate: [
      { name: "poolId", decoder: "uint64" },
      { name: "scId", decoder: "bytes16" },
      { name: "target", decoder: "bytes32" },
      { name: "sender", decoder: "bytes32" },
      { name: "extraGasLimit", decoder: "uint128" },
      { name: "payload", decoder: "bytes" }, // Dynamic length
    ],
  },
} as const;

/** Union of all decoded message payload types across all registry versions */
export type DecodedMessageData = {
  [V in keyof typeof messageDecoders]: DecodedMessageTypes<V>[keyof DecodedMessageTypes<V>];
}[keyof typeof messageDecoders];

/**
 * Creates a function that decodes the length of a dynamic length message
 * @param baseLength - The base length of the message
 * @returns A function that decodes the length of a dynamic length message
 */
function dynamicLengthDecoder(baseLength: number) {
  return function (message: Buffer) {
    return baseLength + 2 + message.readUint16BE(baseLength);
  };
}

/**
 * Special decoder for SetPoolAdapters where length is at offset 11
 * @param message - The message buffer
 * @returns The total length of the message
 */
function setPoolAdaptersLengthDecoder(message: Buffer) {
  const length = message.readUint16BE(11);
  return 13 + length * 32; // base (13) + length field (2) + adapterList (length * 32)
}

/**
 * Gets the string name of a cross-chain message type from its numeric ID
 * @param messageType - The numeric ID of the message type
 * @param versionIndex - The index in the CrosschainMessageType array (0 for V3, 1 for V3_1, defaults to 0)
 * @returns The string name of the message type
 */
export function getCrosschainMessageType<V extends keyof typeof messageDecoders>(
  messageType: number,
  versionIndex: V
): keyof (typeof messageDecoders)[V] {
  const names = Object.keys(messageDecoders[versionIndex]);
  return (names[messageType] ?? "_Invalid") as keyof (typeof messageDecoders)[V];
}

/**
 * Gets the length of a cross-chain message
 * @param messageType - The numeric ID of the message type
 * @param message - The message buffer
 * @param versionIndex - The index in the CrosschainMessageType array (0 for V3, 1 for V3_1, defaults to 0)
 * @returns The length of the message
 */
export function getCrosschainMessageLength(
  messageType: number,
  message: Buffer,
  versionIndex: keyof typeof CrosschainMessageType
) {
  const messageTypes = CrosschainMessageType[versionIndex];
  if (!messageTypes) {
    return 0;
  }
  const lengthEntry = Object.values(messageTypes)[messageType];
  return typeof lengthEntry === "function" ? lengthEntry(message) : lengthEntry;
}

/**
 * Generates a unique message ID by hashing chain IDs and message bytes
 *
 * @param sourceChainId - The Centrifuge Chain ID of the source chain
 * @param destChainId - The Centrifuge Chain ID of the destination chain
 * @param messageHash - The hash of the message bytes
 * @returns The keccak256 hash of the encoded parameters as the message ID
 */
export function getMessageId(
  sourceCentrifugeId: string,
  destCentrifugeId: string,
  messageHash: `0x${string}`
) {
  const messageId = keccak256(
    encodePacked(
      ["uint16", "uint16", "bytes"],
      [Number(sourceCentrifugeId), Number(destCentrifugeId), messageHash]
    )
  );
  return messageId;
}

/**
 * Generates a hash of a message bytes
 * @param messageBytes - The message bytes
 * @returns The hash of the message bytes
 */
export function getMessageHash(messageBytes: `0x${string}`) {
  return keccak256(messageBytes);
}

// ============================================================================
// Payload Decoders (must be defined before decodeMessage uses them)
// ============================================================================

// Request Message Payload Types
const RequestMessageType = {
  Invalid: 0,
  DepositRequest: 1,
  RedeemRequest: 2,
  CancelDepositRequest: 3,
  CancelRedeemRequest: 4,
} as const;

type RequestMessageTypeKey = keyof typeof RequestMessageType;

const requestMessageDecoders = {
  Invalid: [],
  DepositRequest: [
    { name: "investor", decoder: "bytes32" },
    { name: "amount", decoder: "uint128" },
  ],
  RedeemRequest: [
    { name: "investor", decoder: "bytes32" },
    { name: "amount", decoder: "uint128" },
  ],
  CancelDepositRequest: [{ name: "investor", decoder: "bytes32" }],
  CancelRedeemRequest: [{ name: "investor", decoder: "bytes32" }],
} as const satisfies Record<RequestMessageTypeKey, DecoderConfig[]>;

type DecodedRequestMessageTypes = {
  [K in keyof typeof requestMessageDecoders]: {
    [P in (typeof requestMessageDecoders)[K][number] as P["name"]]: DecoderReturnTypes[P["decoder"]];
  };
};

/**
 * Get the request message type name from a numeric request type
 * @param requestType - The numeric request type from the message
 * @returns The corresponding request message type key
 */
function getRequestMessageType(requestType: number): RequestMessageTypeKey {
  return (Object.keys(RequestMessageType)[requestType] ?? "Invalid") as RequestMessageTypeKey;
}

/**
 * Decode a request message payload buffer
 * @param payloadBuffer - The buffer containing the request message payload
 * @returns An object with the decoded request type and data, or null if decoding fails
 */
function decodeRequestPayload(
  payloadBuffer: Buffer
): { type: RequestMessageTypeKey; data: DecodedRequestMessageTypes[RequestMessageTypeKey] } | null {
  if (payloadBuffer.length < 3) return null; // Need at least 2 bytes for length + 1 for type

  // Skip the 2-byte length prefix
  const requestType = payloadBuffer.readUInt8(2);
  const requestTypeName = getRequestMessageType(requestType);
  const messageSpec = requestMessageDecoders[requestTypeName];
  if (!messageSpec) return null;

  let offset = 3; // Skip length prefix (2 bytes) + type byte (1 byte)
  const decodedData: any = {};
  for (const spec of messageSpec) {
    const [decoder, length] = MessageDecoders[spec.decoder];
    if (!decoder) return null;
    const value = decoder(payloadBuffer.subarray(offset, offset + length));
    decodedData[spec.name] = value;
    offset += length;
  }
  return { type: requestTypeName, data: decodedData };
}

// RequestCallback Message Payload Types
const RequestCallbackMessageType = {
  Invalid: 0,
  ApprovedDeposits: 1,
  IssuedShares: 2,
  RevokedShares: 3,
  FulfilledDepositRequest: 4,
  FulfilledRedeemRequest: 5,
} as const;

type RequestCallbackMessageTypeKey = keyof typeof RequestCallbackMessageType;

const requestCallbackMessageDecoders = {
  Invalid: [],
  ApprovedDeposits: [
    { name: "assetAmount", decoder: "uint128" },
    { name: "pricePoolPerAsset", decoder: "uint128" },
  ],
  IssuedShares: [
    { name: "shareAmount", decoder: "uint128" },
    { name: "pricePoolPerShare", decoder: "uint128" },
  ],
  RevokedShares: [
    { name: "assetAmount", decoder: "uint128" },
    { name: "shareAmount", decoder: "uint128" },
    { name: "pricePoolPerShare", decoder: "uint128" },
  ],
  FulfilledDepositRequest: [
    { name: "investor", decoder: "bytes32" },
    { name: "fulfilledAssetAmount", decoder: "uint128" },
    { name: "fulfilledShareAmount", decoder: "uint128" },
    { name: "cancelledAssetAmount", decoder: "uint128" },
  ],
  FulfilledRedeemRequest: [
    { name: "investor", decoder: "bytes32" },
    { name: "fulfilledAssetAmount", decoder: "uint128" },
    { name: "fulfilledShareAmount", decoder: "uint128" },
    { name: "cancelledShareAmount", decoder: "uint128" },
  ],
} as const satisfies Record<RequestCallbackMessageTypeKey, DecoderConfig[]>;

type DecodedRequestCallbackMessageTypes = {
  [K in keyof typeof requestCallbackMessageDecoders]: {
    [P in (typeof requestCallbackMessageDecoders)[K][number] as P["name"]]: DecoderReturnTypes[P["decoder"]];
  };
};

/**
 * Get the request callback message type name from a numeric callback type
 * @param callbackType - The numeric callback type from the message
 * @returns The corresponding request callback message type key
 */
function getRequestCallbackMessageType(callbackType: number): RequestCallbackMessageTypeKey {
  return (Object.keys(RequestCallbackMessageType)[callbackType] ??
    "Invalid") as RequestCallbackMessageTypeKey;
}

/**
 * Decode a request callback message payload buffer
 * @param payloadBuffer - The buffer containing the request callback message payload
 * @returns An object with the decoded callback type and data, or null if decoding fails
 */
function decodeRequestCallbackPayload(payloadBuffer: Buffer): {
  type: RequestCallbackMessageTypeKey;
  data: DecodedRequestCallbackMessageTypes[RequestCallbackMessageTypeKey];
} | null {
  if (payloadBuffer.length < 3) return null; // Need at least 2 bytes for length + 1 for type

  // Skip the 2-byte length prefix
  const callbackType = payloadBuffer.readUInt8(2);
  const callbackTypeName = getRequestCallbackMessageType(callbackType);
  const messageSpec = requestCallbackMessageDecoders[callbackTypeName];
  if (!messageSpec) return null;

  let offset = 3; // Skip length prefix (2 bytes) + type byte (1 byte)
  const decodedData: any = {};
  for (const spec of messageSpec) {
    const [decoder, length] = MessageDecoders[spec.decoder];
    if (!decoder) return null;
    const value = decoder(payloadBuffer.subarray(offset, offset + length));
    decodedData[spec.name] = value;
    offset += length;
  }
  return { type: callbackTypeName, data: decodedData };
}

// UpdateRestriction Message Payload Types
const UpdateRestrictionMessageType = {
  Invalid: 0,
  Member: 1,
  Freeze: 2,
  Unfreeze: 3,
} as const;

type UpdateRestrictionMessageTypeKey = keyof typeof UpdateRestrictionMessageType;

const updateRestrictionMessageDecoders = {
  Invalid: [],
  Member: [
    { name: "user", decoder: "bytes32" },
    { name: "validUntil", decoder: "uint64" },
  ],
  Freeze: [{ name: "user", decoder: "bytes32" }],
  Unfreeze: [{ name: "user", decoder: "bytes32" }],
} as const satisfies Record<UpdateRestrictionMessageTypeKey, DecoderConfig[]>;

type DecodedUpdateRestrictionMessageTypes = {
  [K in keyof typeof updateRestrictionMessageDecoders]: {
    [P in (typeof updateRestrictionMessageDecoders)[K][number] as P["name"]]: DecoderReturnTypes[P["decoder"]];
  };
};

/**
 * Get the update restriction message type name from a numeric restriction type
 * @param restrictionType - The numeric restriction type from the message
 * @returns The corresponding update restriction message type key
 */
function getUpdateRestrictionMessageType(restrictionType: number): UpdateRestrictionMessageTypeKey {
  return (Object.keys(UpdateRestrictionMessageType)[restrictionType] ??
    "Invalid") as UpdateRestrictionMessageTypeKey;
}

/**
 * Decode an update restriction message payload buffer
 * @param payloadBuffer - The buffer containing the update restriction message payload
 * @returns An object with the decoded restriction type and data, or null if decoding fails
 */
function decodeUpdateRestrictionPayload(payloadBuffer: Buffer): {
  type: UpdateRestrictionMessageTypeKey;
  data: DecodedUpdateRestrictionMessageTypes[UpdateRestrictionMessageTypeKey];
} | null {
  if (payloadBuffer.length < 3) return null; // Need at least 2 bytes for length + 1 for type

  // Skip the 2-byte length prefix
  const restrictionType = payloadBuffer.readUInt8(2);
  const restrictionTypeName = getUpdateRestrictionMessageType(restrictionType);
  const messageSpec = updateRestrictionMessageDecoders[restrictionTypeName];
  if (!messageSpec) return null;

  let offset = 3; // Skip length prefix (2 bytes) + type byte (1 byte)
  const decodedData: any = {};
  for (const spec of messageSpec) {
    const [decoder, length] = MessageDecoders[spec.decoder];
    if (!decoder) return null;
    const value = decoder(payloadBuffer.subarray(offset, offset + length));
    decodedData[spec.name] = value;
    offset += length;
  }
  return { type: restrictionTypeName, data: decodedData };
}

/**
 * Decodes a cross-chain message into its parameters
 * @param messageType - The type of the message
 * @param messageBuffer - The buffer containing the message
 * @param version - The version key ("v3" or "v3_1") selecting the decoder set
 * @returns The decoded parameters as a properly typed object
 */
export function decodeMessage<
  V extends RegistryVersions,
  T extends keyof (typeof messageDecoders)[V] = keyof (typeof messageDecoders)[V],
>(messageType: T, messageBuffer: Buffer, version: V): DecodedMessageResult<V, T> | null {
  const decoders = messageDecoders[version];
  if (!decoders) {
    serviceError(`Invalid version: ${version}`);
    return null;
  }
  const messageSpec = decoders[messageType] as readonly DecoderConfig[];
  if (!messageSpec) {
    serviceError(`Invalid message type: ${String(messageType)}`);
    return null;
  }

  let offset = 0;
  const decodedData: Record<string, unknown> = {};
  for (let i = 0; i < messageSpec.length; i++) {
    const spec = messageSpec[i];
    if (!spec) continue;

    const decoderEntry = MessageDecoders[spec.decoder];
    if (!decoderEntry) {
      serviceError(`Invalid decoder: ${spec.decoder}`);
      return null;
    }
    const [decoder, length] = decoderEntry;
    // For dynamic length fields (length = 0) that are the last field, read all remaining bytes
    const isLastField = i === messageSpec.length - 1;
    const bytesToRead = length === 0 && isLastField ? messageBuffer.length - offset : length;
    const value = decoder(messageBuffer.subarray(offset, offset + bytesToRead));
    decodedData[spec.name] = value;
    offset += bytesToRead;
  }

  // Decode nested payloads for specific message types
  if (decodedData && messageType === "Request" && "payload" in decodedData) {
    const payloadHex = decodedData.payload as string;
    if (payloadHex && payloadHex !== "0x") {
      const payloadBuffer = Buffer.from(payloadHex.substring(2), "hex");
      const decodedPayload = decodeRequestPayload(payloadBuffer);
      decodedData.decodedPayload = decodedPayload;
    }
  } else if (decodedData && messageType === "RequestCallback" && "payload" in decodedData) {
    const payloadHex = decodedData.payload as string;
    if (payloadHex && payloadHex !== "0x") {
      const payloadBuffer = Buffer.from(payloadHex.substring(2), "hex");
      const decodedPayload = decodeRequestCallbackPayload(payloadBuffer);
      decodedData.decodedPayload = decodedPayload;
    }
  } else if (decodedData && messageType === "UpdateRestriction" && "payload" in decodedData) {
    const payloadHex = decodedData.payload as string;
    if (payloadHex && payloadHex !== "0x") {
      const payloadBuffer = Buffer.from(payloadHex.substring(2), "hex");
      const decodedPayload = decodeUpdateRestrictionPayload(payloadBuffer);
      decodedData.decodedPayload = decodedPayload;
    }
  }

  return decodedData as DecodedMessageResult<V, T>;
}
