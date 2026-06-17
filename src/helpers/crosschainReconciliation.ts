import type { Context, Event } from "ponder:registry";
import { CrosschainMessageQueue, CrosschainPayloadQueue } from "ponder:schema";
import { expandInlineObject, serviceLog } from "./logger";
import {
  getPayloadSendAnchorAt,
  payloadIndexFromMessages,
  resolvePayloadKeyForEvent,
} from "../services/CrosschainPayloadService";
import {
  getMessageSendAnchorAt,
  passesCausalOrder,
  pickSendTarget,
  sortMessageQueueFifo,
} from "../services/CrosschainMessageService";
import {
  AdapterParticipationService,
  CrosschainMessageQueueService,
  CrosschainMessageService,
  CrosschainPayloadQueueService,
  CrosschainPayloadService,
  PoolAdapterService,
  type CrosschainQueuePk,
} from "../services";

export { getPayloadSendAnchorAt } from "../services/CrosschainPayloadService";
export {
  getMessageSendAnchorAt,
  passesCausalOrder,
  pickSendTarget,
  sortMessageQueueFifo,
} from "../services/CrosschainMessageService";

type TxEvent = Extract<Event, { transaction: { hash: `0x${string}` } }>;

/** Source of a receive entry: live handler or persisted queue row. */
export type ReceiveEntrySource = "incoming" | "queue";

/** Normalized gateway receive fact for execute/fail reconciliation. */
export type MessageReceiveEntry = {
  source: ReceiveEntrySource;
  queuePk?: CrosschainQueuePk;
  status: "execute" | "fail";
  messageId: `0x${string}`;
  hash: `0x${string}`;
  fromCentrifugeId: string;
  toCentrifugeId: string;
  failReason?: `0x${string}` | null;
  rawData: `0x${string}`;
  receivedAt: Date;
  receivedAtBlock: number;
  receivedAtChainId: number;
  receivedAtTxHash: `0x${string}`;
};

/** Normalized multi-adapter handle fact for payload reconciliation. */
export type PayloadReceiveEntry = {
  source: ReceiveEntrySource;
  queuePk?: CrosschainQueuePk;
  type: "PAYLOAD" | "PROOF";
  payloadId: `0x${string}`;
  adapterId: string;
  fromCentrifugeId: string;
  toCentrifugeId: string;
  receivedAt: Date;
  receivedAtBlock: number;
  receivedAtChainId: number;
  receivedAtTxHash: `0x${string}`;
};

/** Keys passed to send-side reconciliation wrapper. */
export type ReconcileKeys = {
  messageIds?: readonly `0x${string}`[];
  payloadIds?: readonly `0x${string}`[];
};

/**
 * Builds a message receive entry from a live gateway event.
 * @param event - Ponder event
 * @param chainId - Indexing chain id
 * @param fields - Normalized receive fields
 * @returns Entry for reconcile orchestrator
 */
export function messageReceiveEntryFromEvent(
  event: TxEvent & { log: { logIndex: number } },
  chainId: number,
  fields: Omit<
    MessageReceiveEntry,
    "source" | "receivedAt" | "receivedAtBlock" | "receivedAtChainId" | "receivedAtTxHash"
  >
): MessageReceiveEntry {
  return {
    ...fields,
    source: "incoming",
    queuePk: {
      chainId,
      transactionHash: event.transaction.hash,
      logIndex: event.log.logIndex,
    },
    receivedAt: new Date(Number(event.block.timestamp) * 1000),
    receivedAtBlock: Number(event.block.number),
    receivedAtChainId: chainId,
    receivedAtTxHash: event.transaction.hash,
  };
}

/**
 * Builds a payload receive entry from a live multi-adapter handle event.
 * @param event - Ponder event
 * @param chainId - Indexing chain id
 * @param fields - Normalized receive fields
 * @returns Entry for reconcile orchestrator
 */
export function payloadReceiveEntryFromEvent(
  event: TxEvent & { log: { logIndex: number } },
  chainId: number,
  fields: Omit<
    PayloadReceiveEntry,
    "source" | "receivedAt" | "receivedAtBlock" | "receivedAtChainId" | "receivedAtTxHash"
  >
): PayloadReceiveEntry {
  return {
    ...fields,
    source: "incoming",
    queuePk: {
      chainId,
      transactionHash: event.transaction.hash,
      logIndex: event.log.logIndex,
    },
    receivedAt: new Date(Number(event.block.timestamp) * 1000),
    receivedAtBlock: Number(event.block.number),
    receivedAtChainId: chainId,
    receivedAtTxHash: event.transaction.hash,
  };
}

/**
 * FIFO sort for payload receive work list.
 * @param entries - Entries to sort
 * @returns Sorted copy
 */
export function sortPayloadQueueFifo(entries: PayloadReceiveEntry[]): PayloadReceiveEntry[] {
  return [...entries].sort((a, b) => {
    const ta = a.receivedAt.getTime();
    const tb = b.receivedAt.getTime();
    if (ta !== tb) return ta - tb;
    return a.receivedAtBlock - b.receivedAtBlock;
  });
}

/**
 * Maps a persisted message queue row to a normalized receive entry.
 * @param row - Queue table row
 * @returns Normalized message receive entry
 */
function messageEntryFromQueueRow(row: (typeof CrosschainMessageQueue)["$inferSelect"]): MessageReceiveEntry {
  return {
    source: "queue",
    queuePk: {
      chainId: row.chainId,
      transactionHash: row.transactionHash,
      logIndex: row.logIndex,
    },
    status: row.status,
    messageId: row.messageId,
    hash: row.hash,
    fromCentrifugeId: row.fromCentrifugeId,
    toCentrifugeId: row.toCentrifugeId,
    failReason: row.failReason,
    rawData: row.rawData,
    receivedAt: row.receivedAt,
    receivedAtBlock: row.receivedAtBlock,
    receivedAtChainId: row.receivedAtChainId,
    receivedAtTxHash: row.receivedAtTxHash,
  };
}

/**
 * Maps a persisted payload queue row to a normalized receive entry.
 * @param row - Queue table row
 * @returns Normalized payload receive entry
 */
function payloadEntryFromQueueRow(row: (typeof CrosschainPayloadQueue)["$inferSelect"]): PayloadReceiveEntry {
  return {
    source: "queue",
    queuePk: {
      chainId: row.chainId,
      transactionHash: row.transactionHash,
      logIndex: row.logIndex,
    },
    type: row.type,
    payloadId: row.payloadId,
    adapterId: row.adapterId,
    fromCentrifugeId: row.fromCentrifugeId,
    toCentrifugeId: row.toCentrifugeId,
    receivedAt: row.receivedAt,
    receivedAtBlock: row.receivedAtBlock,
    receivedAtChainId: row.receivedAtChainId,
    receivedAtTxHash: row.receivedAtTxHash,
  };
}

/**
 * Builds queue insert payload from an incoming message receive entry.
 * @param entry - Receive entry with queue PK
 * @returns Row for `CrosschainMessageQueueService.enqueue`
 */
function messageEntryToQueueInsert(entry: MessageReceiveEntry): Parameters<
  typeof CrosschainMessageQueueService.enqueue
>[1] {
  const pk = entry.queuePk!;
  return {
    chainId: pk.chainId,
    transactionHash: pk.transactionHash,
    logIndex: pk.logIndex,
    status: entry.status,
    messageId: entry.messageId,
    hash: entry.hash,
    fromCentrifugeId: entry.fromCentrifugeId,
    toCentrifugeId: entry.toCentrifugeId,
    failReason: entry.failReason ?? null,
    rawData: entry.rawData,
    receivedAt: entry.receivedAt,
    receivedAtBlock: entry.receivedAtBlock,
    receivedAtChainId: entry.receivedAtChainId,
    receivedAtTxHash: entry.receivedAtTxHash,
  };
}

/**
 * Builds queue insert payload from an incoming payload receive entry.
 * @param entry - Receive entry with queue PK
 * @returns Row for `CrosschainPayloadQueueService.enqueue`
 */
function payloadEntryToQueueInsert(entry: PayloadReceiveEntry): Parameters<
  typeof CrosschainPayloadQueueService.enqueue
>[1] {
  const pk = entry.queuePk!;
  return {
    chainId: pk.chainId,
    transactionHash: pk.transactionHash,
    logIndex: pk.logIndex,
    type: entry.type,
    payloadId: entry.payloadId,
    adapterId: entry.adapterId,
    fromCentrifugeId: entry.fromCentrifugeId,
    toCentrifugeId: entry.toCentrifugeId,
    receivedAt: entry.receivedAt,
    receivedAtBlock: entry.receivedAtBlock,
    receivedAtChainId: entry.receivedAtChainId,
    receivedAtTxHash: entry.receivedAtTxHash,
  };
}

/**
 * Refreshes payload derived facts after a receive event (SQL aggregates).
 * @param context - Ponder context
 * @param entry - Receive anchor timestamps
 * @param payloadId - Payload id
 * @param payloadIndex - Payload index
 * @param options - Whether to set deliveredAt from anchor (gateway message receive)
 */
async function refreshLinkedPayloadStatus(
  context: Context,
  entry: {
    receivedAt: Date;
    receivedAtBlock: number;
    receivedAtTxHash: `0x${string}`;
    receivedAtChainId: number;
  },
  payloadId: `0x${string}`,
  payloadIndex: number,
  options: { setDeliveredFromAnchor?: boolean } = {}
): Promise<void> {
  await CrosschainPayloadService.refreshPayloadStatusFromAggregates(
    context,
    entry,
    payloadId,
    payloadIndex,
    options
  );
}

/**
 * Post-apply side effects for message receives (pool adapter clear, payload completion).
 * @param context - Ponder context
 * @param event - Handler event
 * @param entry - Applied receive entry
 * @param crosschainMessage - Upserted message service instance
 * @param priorData - Target row data before receive facts
 */
async function applyMessageReceiveSideEffects(
  context: Context,
  event: TxEvent,
  entry: MessageReceiveEntry,
  crosschainMessage: CrosschainMessageService,
  priorData: ReturnType<CrosschainMessageService["read"]> | undefined
): Promise<void> {
  const { payloadId, payloadIndex, data } = crosschainMessage.read();

  if (entry.status === "fail") {
    const setPoolAdapters = PoolAdapterService.parseSetPoolAdaptersMessageData(
      data ?? priorData?.data
    );
    if (setPoolAdapters) {
      await PoolAdapterService.clearCrosschainInProgress(
        context,
        {
          localCentrifugeId: entry.toCentrifugeId,
          remoteCentrifugeId: entry.fromCentrifugeId,
          poolId: setPoolAdapters.poolId,
        },
        event
      );
    }
  }

  if (!payloadId || payloadIndex == null) return;

  await refreshLinkedPayloadStatus(
    context,
    {
      receivedAt: entry.receivedAt,
      receivedAtBlock: entry.receivedAtBlock,
      receivedAtTxHash: entry.receivedAtTxHash,
      receivedAtChainId: entry.receivedAtChainId,
    },
    payloadId,
    payloadIndex,
    { setDeliveredFromAnchor: true }
  );
}

/**
 * Attempts to apply one message receive entry to committed rows.
 * @param context - Ponder context
 * @param event - Handler event (for upsert defaults)
 * @param entry - Receive entry
 * @param committedRows - Committed rows for message id
 * @returns applied or waiting
 */
async function tryApplyMessageReceive(
  context: Context,
  event: TxEvent,
  entry: MessageReceiveEntry,
  committedRows: CrosschainMessageService[]
): Promise<"applied" | "waiting"> {
  const payloadAnchors = new Map<
    string,
    { sentAt: Date | null; underpaidAt: Date | null }
  >();
  for (const row of committedRows) {
    const d = row.read();
    if (!d.payloadId || d.payloadIndex == null) continue;
    const key = `${d.payloadId}:${d.payloadIndex}`;
    if (payloadAnchors.has(key)) continue;
    const payloadRow = (await CrosschainPayloadService.get(context, {
      id: d.payloadId,
      index: d.payloadIndex,
    })) as CrosschainPayloadService | null;
    if (payloadRow) payloadAnchors.set(key, payloadRow.read());
  }

  const payloadAnchorFor = (row: {
    payloadId?: `0x${string}` | null;
    payloadIndex?: number | null;
  }) => {
    if (!row.payloadId || row.payloadIndex == null) return null;
    return payloadAnchors.get(`${row.payloadId}:${row.payloadIndex}`) ?? null;
  };

  const targetRef = pickSendTarget(committedRows, entry.status, payloadAnchorFor);
  if (!targetRef) return "waiting";

  const targetIndex = targetRef.read().index;
  const target = committedRows.find((r) => r.read().index === targetIndex);
  if (!target) return "waiting";

  const targetData = target.read();
  if (entry.status === "fail" && targetData.failedAt != null) {
    return "applied";
  }

  const sendAnchor = getMessageSendAnchorAt(targetData, payloadAnchorFor(targetData));
  if (!passesCausalOrder(entry.receivedAt, sendAnchor)) return "waiting";

  const receiveFacts =
    entry.status === "execute"
      ? {
          executedAt: entry.receivedAt,
          executedAtBlock: entry.receivedAtBlock,
          executedAtTxHash: entry.receivedAtTxHash,
          executedAtChainId: entry.receivedAtChainId,
        }
      : {
          failedAt: entry.receivedAt,
          failedAtBlock: entry.receivedAtBlock,
          failedAtTxHash: entry.receivedAtTxHash,
          failedAtChainId: entry.receivedAtChainId,
          failReason: entry.failReason ?? undefined,
        };

  const crosschainMessage = await CrosschainMessageService.upsertFacts(
    context,
    event,
    { id: entry.messageId, index: targetData.index },
    {
      fromCentrifugeId: entry.fromCentrifugeId,
      toCentrifugeId: entry.toCentrifugeId,
      hash: entry.hash,
      messageType: targetData.messageType,
      rawData: entry.rawData !== "0x" ? entry.rawData : targetData.rawData,
      ...receiveFacts,
    }
  );

  await applyMessageReceiveSideEffects(context, event, entry, crosschainMessage, targetData);
  return "applied";
}

/**
 * Resolves the committed payload row for a handle receive using `(payloadId, index)`.
 * @param context - Ponder context
 * @param entry - Payload receive entry (adapter + type for SEND linkage)
 * @returns Payload service instance or null when send row not indexed yet
 */
async function resolvePayloadRowForHandle(
  context: Context,
  entry: PayloadReceiveEntry
): Promise<CrosschainPayloadService | null> {
  const { payloadId } = entry;
  const rows = await CrosschainPayloadService.loadAllForPayloadId(context, payloadId);
  if (rows.length === 0) return null;

  const rowByIndex = (index: number) => rows.find((r) => r.read().index === index) ?? null;

  const sendParticipations = (await AdapterParticipationService.query(context, {
    payloadId,
    adapterId: entry.adapterId.toLowerCase(),
    side: "SEND",
    type: entry.type,
  })) as AdapterParticipationService[];
  const participationIndices = [
    ...new Set(sendParticipations.map((p) => p.read().payloadIndex)),
  ];
  if (participationIndices.length === 1) {
    const fromParticipation = rowByIndex(participationIndices[0]!);
    if (fromParticipation) return fromParticipation;
  }

  const linkedMessages = (await CrosschainMessageService.query(context, {
    payloadId,
  })) as CrosschainMessageService[];
  const messageIndex = payloadIndexFromMessages(linkedMessages.map((m) => m.read()));
  if (messageIndex != null) {
    const fromMessages = rowByIndex(messageIndex);
    if (fromMessages) return fromMessages;
  }

  const key = resolvePayloadKeyForEvent(
    "HandlePayload",
    rows.map((r) => r.read()),
    { deferAllowed: true }
  );
  if (key.action === "mutate") return rowByIndex(key.index);

  return null;
}

/**
 * Marks payload completed when adapter verification and message execution preconditions are met.
 * @param context - Ponder context
 * @param event - Handler event
 * @param entry - Applied payload receive entry
 * @param payloadId - Payload id
 * @param payloadIndex - Payload index
 */
async function applyPayloadDeliverySideEffects(
  context: Context,
  event: TxEvent,
  entry: PayloadReceiveEntry,
  payloadId: `0x${string}`,
  payloadIndex: number
): Promise<void> {
  const payloadRow = (await CrosschainPayloadService.get(context, {
    id: payloadId,
    index: payloadIndex,
  })) as CrosschainPayloadService | null;
  if (!payloadRow) return;

  const current = payloadRow.read();
  if (current.deliveredAt == null) {
    await CrosschainPayloadService.upsertFacts(context, event, { id: payloadId, index: payloadIndex }, {
      deliveredAt: entry.receivedAt,
      deliveredAtBlock: entry.receivedAtBlock,
      deliveredAtTxHash: entry.receivedAtTxHash,
    });
  }

  await refreshLinkedPayloadStatus(
    context,
    {
      receivedAt: entry.receivedAt,
      receivedAtBlock: entry.receivedAtBlock,
      receivedAtTxHash: entry.receivedAtTxHash,
      receivedAtChainId: entry.receivedAtChainId,
    },
    payloadId,
    payloadIndex
  );
}

/**
 * Attempts to apply one payload handle entry to a committed payload row.
 * @param context - Ponder context
 * @param event - Handler event
 * @param entry - Receive entry
 * @returns applied or waiting
 */
async function tryApplyPayloadReceive(
  context: Context,
  event: TxEvent,
  entry: PayloadReceiveEntry
): Promise<"applied" | "waiting"> {
  const payload = await resolvePayloadRowForHandle(context, entry);
  if (!payload) return "waiting";

  const payloadData = payload.read();
  const sendAnchor = getPayloadSendAnchorAt(payloadData);
  if (!passesCausalOrder(entry.receivedAt, sendAnchor)) return "waiting";

  const { index: payloadIndex } = payloadData;

  await AdapterParticipationService.insert(
    context,
    {
      payloadId: entry.payloadId,
      payloadIndex,
      adapterId: entry.adapterId.toLowerCase(),
      centrifugeId: entry.toCentrifugeId,
      fromCentrifugeId: entry.fromCentrifugeId,
      toCentrifugeId: entry.toCentrifugeId,
      side: "HANDLE",
      type: entry.type,
      timestamp: entry.receivedAt,
      blockNumber: entry.receivedAtBlock,
      transactionHash: entry.receivedAtTxHash,
    },
    event
  );

  await applyPayloadDeliverySideEffects(context, event, entry, entry.payloadId, payloadIndex);
  return "applied";
}

/**
 * Reconciles message receive facts (incoming and/or queued) against committed send rows.
 * @param context - Ponder context
 * @param event - Handler event
 * @param messageIds - Message ids to scope queue drain
 * @param incoming - Optional live receive entry from current handler
 */
export async function reconcileMessageReceives(
  context: Context,
  event: TxEvent,
  messageIds: readonly `0x${string}`[],
  incoming?: MessageReceiveEntry[]
): Promise<void> {
  const scopedIds = new Set<`0x${string}`>(messageIds);
  for (const entry of incoming ?? []) {
    scopedIds.add(entry.messageId);
  }
  const uniqueIds = [...scopedIds];
  if (uniqueIds.length === 0) return;

  if (!incoming?.length) {
    const queued = await CrosschainMessageQueueService.countForKeys(context, uniqueIds);
    if (queued === 0) return;
  }

  serviceLog(
    "reconcileMessageReceives",
    expandInlineObject({ messageIds: uniqueIds.length, incoming: incoming?.length ?? 0 })
  );

  let rowsById = await CrosschainMessageService.loadCrosschainMessagesByMessageIds(
    context,
    uniqueIds
  );

  const queueRows = await CrosschainMessageQueueService.queryFifoForKeys(context, uniqueIds);
  const workList = sortMessageQueueFifo([
    ...(incoming ?? []),
    ...queueRows.map(messageEntryFromQueueRow),
  ]);

  const dirtyIds = new Set<`0x${string}`>();
  const toDelete: CrosschainQueuePk[] = [];

  for (const entry of workList) {
    if (dirtyIds.has(entry.messageId)) {
      rowsById = await CrosschainMessageService.loadCrosschainMessagesByMessageIds(context, [
        entry.messageId,
      ]);
      dirtyIds.delete(entry.messageId);
    }

    const committedRows = rowsById.get(entry.messageId) ?? [];
    const result = await tryApplyMessageReceive(context, event, entry, committedRows);

    if (result === "applied") {
      dirtyIds.add(entry.messageId);
      if (entry.source === "queue" && entry.queuePk) {
        toDelete.push(entry.queuePk);
      }
      continue;
    }

    if (entry.source === "incoming" && entry.queuePk) {
      await CrosschainMessageQueueService.enqueue(context, messageEntryToQueueInsert(entry));
    }
  }

  await CrosschainMessageQueueService.deleteMany(context, toDelete);
}

/**
 * Reconciles payload handle facts (incoming and/or queued) against committed send rows.
 * @param context - Ponder context
 * @param event - Handler event
 * @param payloadIds - Payload ids to scope queue drain
 * @param incoming - Optional live receive entry from current handler
 */
export async function reconcilePayloadReceives(
  context: Context,
  event: TxEvent,
  payloadIds: readonly `0x${string}`[],
  incoming?: PayloadReceiveEntry[]
): Promise<void> {
  const scopedIds = new Set<`0x${string}`>(payloadIds);
  for (const entry of incoming ?? []) {
    scopedIds.add(entry.payloadId);
  }
  const uniqueIds = [...scopedIds];
  if (uniqueIds.length === 0) return;

  if (!incoming?.length) {
    const queued = await CrosschainPayloadQueueService.countForKeys(context, uniqueIds);
    if (queued === 0) return;
  }

  serviceLog(
    "reconcilePayloadReceives",
    expandInlineObject({ payloadIds: uniqueIds.length, incoming: incoming?.length ?? 0 })
  );

  const queueRows = await CrosschainPayloadQueueService.queryFifoForKeys(context, uniqueIds);
  const workList = sortPayloadQueueFifo([
    ...(incoming ?? []),
    ...queueRows.map(payloadEntryFromQueueRow),
  ]);

  const toDelete: CrosschainQueuePk[] = [];

  for (const entry of workList) {
    const result = await tryApplyPayloadReceive(context, event, entry);

    if (result === "applied") {
      if (entry.source === "queue" && entry.queuePk) {
        toDelete.push(entry.queuePk);
      }
      continue;
    }

    if (entry.source === "incoming" && entry.queuePk) {
      await CrosschainPayloadQueueService.enqueue(context, payloadEntryToQueueInsert(entry));
    }
  }

  await CrosschainPayloadQueueService.deleteMany(context, toDelete);
}

/**
 * Runs send handler body between pre/post queue reconciliation passes.
 * @param context - Ponder context
 * @param event - Send handler event
 * @param keys - Message/payload ids touched by this handler
 * @param fn - Send fact upsert body
 */
export async function runWithSendReconciliation(
  context: Context,
  event: TxEvent,
  keys: ReconcileKeys,
  fn: () => Promise<void>
): Promise<void> {
  const messageIds = keys.messageIds ?? [];
  const payloadIds = keys.payloadIds ?? [];

  await reconcileMessageReceives(context, event, messageIds);
  await reconcilePayloadReceives(context, event, payloadIds);
  await fn();
  await reconcileMessageReceives(context, event, messageIds);
  await reconcilePayloadReceives(context, event, payloadIds);
}
