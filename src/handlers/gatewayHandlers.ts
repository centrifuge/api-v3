import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError } from "../helpers/logger";
import { BlockchainService } from "../services/BlockchainService";
import { timestamper } from "../helpers/timestamper";

import {
  getCrosschainMessageType,
  CrosschainMessageService,
  getMessageId,
  decodeMessage,
} from "../services/CrosschainMessageService";
import {
  CrosschainPayloadService,
  getPayloadId,
  extractMessagesFromPayload,
} from "../services/CrosschainPayloadService";
import { getVersionIndexForContract } from "../contracts";

multiMapper("gateway:PrepareMessage", async ({ event, context }) => {
  logEvent(event, context, "gateway:PrepareMessage");
  const { centrifugeId: toCentrifugeId, poolId, message } = event.args;
  const versionIndex = getVersionIndexForContract("gateway", context.chain.id, event.log.address);
  const messageBuffer = Buffer.from(message.substring(2), "hex");
  const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0), versionIndex);
  const messagePayload = messageBuffer.subarray(1);

  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const messageId = getMessageId(
    fromCentrifugeId,
    toCentrifugeId.toString(),
    message
  );
  const messageCount = await CrosschainMessageService.count(context, {
    id: messageId,
  });

  const rawData = `0x${Buffer.from(
    messageBuffer.toString("hex")
  )}` as `0x${string}`;
  const data = decodeMessage(messageType, messagePayload, versionIndex);

  const _crosschainMessage = (await CrosschainMessageService.insert(
    context,
    {
      id: messageId,
      index: messageCount,
      poolId: poolId || null,
      fromCentrifugeId,
      toCentrifugeId: toCentrifugeId.toString(),
      messageType: messageType,
      rawData,
      data: data,
      status: "AwaitingBatchDelivery",
    },
    event
  )) as CrosschainMessageService | null;
});

multiMapper("gateway:UnderpaidBatch", async ({ event, context }) => {
  logEvent(event, context, "gateway:UnderpaidBatch");
  const { centrifugeId: toCentrifugeId, batch } = event.args;
  const versionIndex = getVersionIndexForContract("gateway", context.chain.id, event.log.address);
  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const payloadId = getPayloadId(
    fromCentrifugeId,
    toCentrifugeId.toString(),
    batch
  );

  const alreadyInitialized =
    await CrosschainPayloadService.getUnderpaidFromQueue(context, payloadId);
  if (alreadyInitialized) {
    logEvent(
      event,
      context,
      `UnderpaidBatch already initialized for payloadId ${payloadId}`
    );
    return;
  }

  const payloadIndex = await CrosschainPayloadService.count(context, {
    id: payloadId,
  });

  const poolIdSet = new Set<bigint>();
  const messages = extractMessagesFromPayload(batch, versionIndex);
  for (const message of messages) {
    const messageBuffer = Buffer.from(message.substring(2), "hex");
    const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0), versionIndex);
    const messagePayload = messageBuffer.subarray(1);

    const messageId = getMessageId(
      fromCentrifugeId,
      toCentrifugeId.toString(),
      message
    );

    const pendingMessage =
      await CrosschainMessageService.getFromAwaitingBatchDeliveryQueue(
        context,
        messageId
      );
    if (pendingMessage) {
      logEvent(
        event,
        context,
        `Message ${messageId} already initialized in awaiting batch delivery queue`
      );
      pendingMessage.setPayloadId(payloadId, payloadIndex);
      await pendingMessage.save(event);
      continue;
    }

    const messageIndex = await CrosschainMessageService.count(context, {
      id: messageId,
    });

    const rawData = `0x${Buffer.from(
      messageBuffer.toString("hex")
    )}` as `0x${string}`;

    const data = decodeMessage(messageType, messagePayload, versionIndex);
    if (!data) {
      serviceError(`Failed to decode message. Cannot process message data`);
      return;
    }

    const poolId = "poolId" in data ? BigInt(data.poolId!) : null;
    if (poolId) poolIdSet.add(poolId);

    const _crosschainMessage = (await CrosschainMessageService.insert(
      context,
      {
        id: messageId,
        index: messageIndex,
        poolId,
        fromCentrifugeId,
        toCentrifugeId: toCentrifugeId.toString(),
        messageType: messageType,
        rawData,
        data: data,
        status: "Unsent",
        payloadId,
        payloadIndex,
      },
      event
    )) as CrosschainMessageService | null;
  }

  const poolIds = Array.from(poolIdSet);
  if (poolIds.length > 1) {
    serviceError(`Multiple poolIds found. Cannot determine single poolId for payload`);
    return;
  }
  const poolId = Array.from(poolIdSet).pop() ?? null;

  const crosschainPayload = (await CrosschainPayloadService.insert(
    context,
    {
      id: payloadId,
      index: payloadIndex,
      poolId,
      rawData: batch,
      toCentrifugeId: toCentrifugeId.toString(),
      fromCentrifugeId: fromCentrifugeId,
      status: "Underpaid",
      ...timestamper("prepared", event),
    },
    event
  )) as CrosschainPayloadService | null;
  if (!crosschainPayload)
    serviceError("Failed to initialize crosschain payload ");
});

multiMapper("gateway:RepayBatch", async ({ event, context }) => {
  logEvent(event, context, "gateway:RepayBatch");
  const { centrifugeId: toCentrifugeId, batch } = event.args;
  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);
  const payloadId = getPayloadId(
    fromCentrifugeId,
    toCentrifugeId.toString(),
    batch
  );

  const crosschainPayload =
    (await CrosschainPayloadService.getUnderpaidFromQueue(
      context,
      payloadId
    )) as CrosschainPayloadService | null;
  if (!crosschainPayload) {
    serviceError(`CrosschainPayload not found in Underpaid queue. Cannot mark messages as awaiting batch delivery`);
    return;
  }
  const { index: payloadIndex } = crosschainPayload.read();
  const crosschainMessages = (await CrosschainMessageService.query(context, {
    payloadId: payloadId,
    payloadIndex: payloadIndex,
    status: "Unsent",
  })) as CrosschainMessageService[];
  const crosschainMessageSaves = [];
  for (const crosschainMessage of crosschainMessages) {
    crosschainMessage.awaitingBatchDelivery();
    crosschainMessageSaves.push(crosschainMessage.save(event));
  }
  await Promise.all(crosschainMessageSaves);

  crosschainPayload.InTransit();
  await crosschainPayload.save(event);
});

multiMapper("gateway:ExecuteMessage", async ({ event, context }) => {
  // RECEIVING CHAIN
  logEvent(event, context, "gateway:ExecuteMessage");
  const { centrifugeId: fromCentrifugeId } = event.args;
  const message = "message" in event.args ? event.args.message : undefined;
  const messageHash =
    "messageHash" in event.args ? event.args.messageHash : undefined;

  const toCentrifugeId = await BlockchainService.getCentrifugeId(context);
  const messageId = message
    ? getMessageId(fromCentrifugeId.toString(), toCentrifugeId, message)
    : messageHash!;

  const crosschainMessage =
    await CrosschainMessageService.getFromAwaitingBatchDeliveryOrFailedQueue(
      context,
      messageId
    );
  if (!crosschainMessage) {
    serviceError(
      `CrosschainMessage not found in AwaitingBatchDelivery queue. Cannot mark message as executed`
    );
    return;
  }

  crosschainMessage.executed(event);
  await crosschainMessage.save(event);

  const { payloadId } = crosschainMessage.read();
  if (!payloadId) {
    serviceError("Payload ID is required");
    return;
  }

  const crosschainPayload =
    (await CrosschainPayloadService.getDeliveredOrPartiallyFailedFromQueue(
      context,
      payloadId
    )) as CrosschainPayloadService | null;
  if (!crosschainPayload) {
    serviceError(
      `CrosschainPayload not found in Delivered or PartiallyFailed queue. Cannot mark payload as completed`
    );
    return;
  }
  const { index: payloadIndex } = crosschainPayload.read();

  const isPayloadFullyExecuted =
    await CrosschainMessageService.checkPayloadFullyExecuted(
      context,
      payloadId,
      payloadIndex
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
    "messageHash" in event.args ? event.args.messageHash : undefined;

  const toCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const messageId = message
    ? getMessageId(fromCentrifugeId.toString(), toCentrifugeId, message)
    : messageHash!;

  const crosschainMessage =
    await CrosschainMessageService.getFromAwaitingBatchDeliveryOrFailedQueue(
      context,
      messageId
    );
  if (!crosschainMessage) {
    serviceError(
      `CrosschainMessage not found in AwaitingBatchDelivery or Failed queue. Cannot mark message as failed`
    );
    return;
  }

  const { status } = crosschainMessage.read();
  if (status === "Failed") return;

  crosschainMessage.setStatus("Failed");
  crosschainMessage.setFailReason(error);
  await crosschainMessage.save(event);

  const { payloadId } = crosschainMessage.read();
  if (!payloadId) return serviceError("Payload ID is required");

  const crosschainPayload =
    (await CrosschainPayloadService.getDeliveredFromQueue(
      context,
      payloadId
    )) as CrosschainPayloadService | null;
  if (!crosschainPayload) {
    serviceError(
      `CrosschainPayload not found in Delivered queue. Cannot mark payload as PartiallyFailed`
    );
    return;
  }

  crosschainPayload.setStatus("PartiallyFailed");
  await crosschainPayload.save(event);
});
