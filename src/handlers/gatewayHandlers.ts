import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError } from "../helpers/logger";
import { BlockchainService } from "../services";
import { timestamper } from "../helpers/timestamper";

import {
  getCrosschainMessageType,
  CrosschainMessageService,
  getMessageId,
  getMessageHash,
  decodeMessage,
} from "../services/CrosschainMessageService";
import {
  CrosschainPayloadService,
  getPayloadId,
  extractMessagesFromPayload,
} from "../services/CrosschainPayloadService";
import { getVersionForContract } from "../contracts";

/**
 * Gateway outbound batching matches `Gateway.send` in cfg-protocol (`src/core/messaging/Gateway.sol`):
 * `emit PrepareMessage` runs unconditionally at the start of `send` (before batching / `_send`), and
 * `UnderpaidBatch` is only emitted from `_addUnpaidBatch` inside `_send` after that. So there is **no**
 * valid on-chain ordering where `UnderpaidBatch` precedes `PrepareMessage` for the same outbound send.
 *
 * PrepareMessage handler skips inserting a duplicate row when this `messageId` already has an
 * `AwaitingBatchDelivery` row without payload (e.g. duplicate `send` with the same bytes, or indexer
 * replay). UnderpaidBatch links those rows or inserts `Unsent` when no matching awaiting row exists
 * (e.g. handler failure on Prepare). Replayed UnderpaidBatch for an existing payload still links stragglers.
 */

multiMapper("gateway:PrepareMessage", async ({ event, context }) => {
  logEvent(event, context, "gateway:PrepareMessage");
  const { centrifugeId: toCentrifugeId, poolId, message } = event.args;

  const version = getVersionForContract("gateway", context.chain.id, event.log.address);
  if (!version) return serviceError("Failed to get registry version");

  const messageBuffer = Buffer.from(message.substring(2), "hex");
  const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0), version);
  const messagePayload = messageBuffer.subarray(1);

  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const messageHash = getMessageHash(message);
  const messageId = getMessageId(fromCentrifugeId, toCentrifugeId.toString(), messageHash);

  const crosschainMessagesForId = (await CrosschainMessageService.query(context, {
    id: messageId,
    _sort: [{ field: "index", direction: "asc" }],
  })) as CrosschainMessageService[];

  if (
    crosschainMessagesForId.some(
      (m) => m.read().status === "AwaitingBatchDelivery" && m.read().payloadId == null
    )
  ) {
    logEvent(
      event,
      context,
      `PrepareMessage skipped: ${messageId} already awaiting batch delivery`
    );
    return;
  }

  const messageCount = crosschainMessagesForId.length;

  const rawData = `0x${Buffer.from(messageBuffer.toString("hex"))}` as `0x${string}`;
  const data = decodeMessage(messageType, messagePayload, version);
  const tokenId = data && "scId" in data ? (data.scId! as `0x${string}`) : null;

  const _crosschainMessage = (await CrosschainMessageService.insert(
    context,
    {
      id: messageId,
      index: messageCount,
      poolId: poolId || null,
      tokenId,
      fromCentrifugeId,
      toCentrifugeId: toCentrifugeId.toString(),
      messageType: messageType,
      rawData,
      hash: messageHash,
      data: data,
      status: "AwaitingBatchDelivery",
    },
    event
  )) as CrosschainMessageService | null;
});

multiMapper("gateway:UnderpaidBatch", async ({ event, context }) => {
  // Primary path: link PrepareMessage rows; batch-only path: insert Unsent + payload. Idempotent when payload exists.
  logEvent(event, context, "gateway:UnderpaidBatch");
  const { centrifugeId: toCentrifugeId, batch } = event.args;

  const version = getVersionForContract("gateway", context.chain.id, event.log.address);
  if (!version) return serviceError("Failed to get registry version");

  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const payloadId = getPayloadId(fromCentrifugeId, toCentrifugeId.toString(), batch);

  const alreadyInitialized = (await CrosschainPayloadService.getUnderpaidFromQueue(
    context,
    payloadId
  )) as CrosschainPayloadService | null;
  if (alreadyInitialized) {
    const { index: existingPayloadIndex } = alreadyInitialized.read();
    const pendingLinkMessages = extractMessagesFromPayload(batch, version);
    const linkOrderedIds = pendingLinkMessages.map((message) =>
      getMessageId(fromCentrifugeId, toCentrifugeId.toString(), getMessageHash(message))
    );
    const crosschainMessagesByMessageId =
      await CrosschainMessageService.loadCrosschainMessagesByMessageIds(context, linkOrderedIds);
    const linkInstances: CrosschainMessageService[] = [];
    for (const messageId of linkOrderedIds) {
      const pendingMessage = CrosschainMessageService.getFirstUnlinkedAwaiting(
        crosschainMessagesByMessageId.get(messageId)
      );
      if (pendingMessage) {
        pendingMessage.setPayloadId(payloadId, existingPayloadIndex);
        linkInstances.push(pendingMessage);
      }
    }
    if (linkInstances.length > 0) {
      await CrosschainMessageService.saveMany(context, linkInstances, event);
    }
    logEvent(
      event,
      context,
      `UnderpaidBatch already initialized for payloadId ${payloadId}; linked any AwaitingBatchDelivery rows`
    );
    return;
  }

  const payloadIndex = await CrosschainPayloadService.count(context, {
    id: payloadId,
  });

  const poolIdSet = new Set<bigint>();
  const tokenIdSet = new Set<`0x${string}`>();
  const messages = extractMessagesFromPayload(batch, version);
  const orderedMessageIds = messages.map((message) =>
    getMessageId(fromCentrifugeId, toCentrifugeId.toString(), getMessageHash(message))
  );
  const crosschainMessagesByMessageId =
    await CrosschainMessageService.loadCrosschainMessagesByMessageIds(context, orderedMessageIds);
  const pendingInsertsById = new Map<`0x${string}`, number>();

  const linkInstances: CrosschainMessageService[] = [];
  const insertRows: Parameters<typeof CrosschainMessageService.insertMany>[1] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;
    const messageBuffer = Buffer.from(message.substring(2), "hex");
    const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0), version);
    const messagePayload = messageBuffer.subarray(1);

    const messageHash = getMessageHash(message);
    const messageId = orderedMessageIds[i]!;

    const rowsForId = crosschainMessagesByMessageId.get(messageId) ?? [];
    const pendingMessage = CrosschainMessageService.getFirstUnlinkedAwaiting(rowsForId);
    if (pendingMessage) {
      logEvent(
        event,
        context,
        `Message ${messageId} already initialized in awaiting batch delivery queue`
      );
      pendingMessage.setPayloadId(payloadId, payloadIndex);
      linkInstances.push(pendingMessage);
      continue;
    }

    const messageIndex = rowsForId.length + (pendingInsertsById.get(messageId) ?? 0);

    const rawData = `0x${Buffer.from(messageBuffer.toString("hex"))}` as `0x${string}`;

    const data = decodeMessage(messageType, messagePayload, version);
    if (!data) {
      serviceError(`Failed to decode message. Cannot process message data`);
      return;
    }

    const poolId = "poolId" in data ? BigInt(data.poolId) : null;
    if (poolId) poolIdSet.add(poolId);

    const tokenId = "scId" in data ? (data.scId as `0x${string}`) : null;
    if (tokenId) tokenIdSet.add(tokenId);

    insertRows.push({
      id: messageId,
      index: messageIndex,
      poolId,
      tokenId,
      fromCentrifugeId,
      toCentrifugeId: toCentrifugeId.toString(),
      messageType: messageType,
      rawData,
      data: data,
      hash: messageHash,
      status: "Unsent",
      payloadId,
      payloadIndex,
    });

    pendingInsertsById.set(messageId, (pendingInsertsById.get(messageId) ?? 0) + 1);
  }

  if (linkInstances.length > 0) {
    await CrosschainMessageService.saveMany(context, linkInstances, event);
  }
  if (insertRows.length > 0) {
    const inserted = await CrosschainMessageService.insertMany(context, insertRows, event);
    if (inserted.length !== insertRows.length) {
      serviceError(
        `UnderpaidBatch: insertMany expected ${insertRows.length} crosschain messages, got ${inserted.length}`
      );
      return;
    }
  }

  const poolIds = Array.from(poolIdSet);
  if (poolIds.length > 1) {
    serviceError(`Multiple poolIds found. Cannot determine single poolId for payload`);
    return;
  }
  const poolId = Array.from(poolIdSet).pop() ?? null;
  const tokenId = Array.from(tokenIdSet).pop() ?? null;

  const crosschainPayload = (await CrosschainPayloadService.insert(
    context,
    {
      id: payloadId,
      index: payloadIndex,
      poolId,
      tokenId,
      rawData: batch,
      toCentrifugeId: toCentrifugeId.toString(),
      fromCentrifugeId: fromCentrifugeId,
      status: "Underpaid",
      ...timestamper("prepared", event),
    },
    event
  )) as CrosschainPayloadService | null;
  if (!crosschainPayload) serviceError("Failed to initialize crosschain payload ");
});

multiMapper("gateway:RepayBatch", async ({ event, context }) => {
  logEvent(event, context, "gateway:RepayBatch");
  const { centrifugeId: toCentrifugeId, batch } = event.args;
  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);
  const payloadId = getPayloadId(fromCentrifugeId, toCentrifugeId.toString(), batch);

  const crosschainPayload = (await CrosschainPayloadService.getUnderpaidFromQueue(
    context,
    payloadId
  )) as CrosschainPayloadService | null;
  if (!crosschainPayload) {
    serviceError(
      `CrosschainPayload not found in Underpaid queue. Cannot mark messages as awaiting batch delivery`
    );
    return;
  }
  const { index: payloadIndex } = crosschainPayload.read();
  const crosschainMessages = (await CrosschainMessageService.query(context, {
    payloadId: payloadId,
    payloadIndex: payloadIndex,
    status: "Unsent",
  })) as CrosschainMessageService[];
  for (const crosschainMessage of crosschainMessages) {
    crosschainMessage.awaitingBatchDelivery();
  }
  if (crosschainMessages.length > 0) {
    await CrosschainMessageService.saveMany(context, crosschainMessages, event);
  }

  crosschainPayload.InTransit();
  await crosschainPayload.save(event);
});

multiMapper("gateway:ExecuteMessage", async ({ event, context }) => {
  // RECEIVING CHAIN
  logEvent(event, context, "gateway:ExecuteMessage");
  const { centrifugeId: fromCentrifugeId } = event.args;
  const message = "message" in event.args ? event.args.message : undefined;
  const messageHash =
    "messageHash" in event.args ? event.args.messageHash : getMessageHash(message!);

  const toCentrifugeId = await BlockchainService.getCentrifugeId(context);
  const messageId = getMessageId(fromCentrifugeId.toString(), toCentrifugeId, messageHash);

  const crosschainMessage =
    await CrosschainMessageService.getFromAwaitingBatchDeliveryOrFailedQueue(context, messageId);
  if (!crosschainMessage) {
    serviceError(
      `CrosschainMessage not found in AwaitingBatchDelivery or Failed queue. Cannot mark message as executed`
    );
    return;
  }

  crosschainMessage.executed(event);
  const { payloadId, payloadIndex: execPayloadIndex } = crosschainMessage.read();
  await crosschainMessage.save(event);

  if (!payloadId || execPayloadIndex == null) {
    serviceError("Payload ID and index are required");
    return;
  }

  const crosschainPayload = (await CrosschainPayloadService.get(context, {
    id: payloadId,
    index: execPayloadIndex,
    status_in: ["Delivered", "PartiallyFailed"],
  })) as CrosschainPayloadService | null;
  if (!crosschainPayload) {
    serviceError(
      `CrosschainPayload not found in Delivered or PartiallyFailed queue. Cannot mark payload as completed`
    );
    return;
  }

  const isPayloadFullyExecuted = await CrosschainMessageService.checkPayloadFullyExecuted(
    context,
    payloadId,
    execPayloadIndex
  );
  if (!isPayloadFullyExecuted) return;

  crosschainPayload.completed(event);
  await crosschainPayload.save(event);
});

multiMapper("gateway:FailMessage", async ({ event, context }) => {
  // RECEIVING CHAIN
  logEvent(event, context, "gateway:FailMessage");
  const { centrifugeId: fromCentrifugeId, error } = event.args;
  const message = "message" in event.args ? event.args.message : undefined;
  const messageHash =
    "messageHash" in event.args ? event.args.messageHash : getMessageHash(message!);

  const toCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const messageId = getMessageId(fromCentrifugeId.toString(), toCentrifugeId, messageHash);

  const crosschainMessage =
    await CrosschainMessageService.getFromAwaitingBatchDeliveryOrFailedQueue(context, messageId);
  if (!crosschainMessage) {
    serviceError(
      `CrosschainMessage not found in AwaitingBatchDelivery or Failed queue. Cannot mark message as failed`
    );
    return;
  }

  const { status, payloadId, payloadIndex: failPayloadIndex } = crosschainMessage.read();
  if (status === "Failed") return;

  crosschainMessage.setStatus("Failed");
  crosschainMessage.setFailReason(error);
  await crosschainMessage.save(event);

  if (!payloadId || failPayloadIndex == null)
    return serviceError("Payload ID and index are required");

  const crosschainPayload = (await CrosschainPayloadService.get(context, {
    id: payloadId,
    index: failPayloadIndex,
    status: "Delivered",
  })) as CrosschainPayloadService | null;
  if (!crosschainPayload) {
    serviceError(
      `CrosschainPayload not found in Delivered queue. Cannot mark payload as PartiallyFailed`
    );
    return;
  }

  crosschainPayload.setStatus("PartiallyFailed");
  await crosschainPayload.save(event);
});
