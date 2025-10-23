import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { BlockchainService } from "../services/BlockchainService";
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

ponder.on("Gateway:PrepareMessage", async ({ event, context }) => {
  logEvent(event, context, "Gateway:PrepareMessage");
  const { centrifugeId: toCentrifugeId, poolId, message } = event.args;
  const messageBuffer = Buffer.from(message.substring(2), "hex");
  const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0));
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
  const data = decodeMessage(messageType, messagePayload);

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
    event.block
  )) as CrosschainMessageService | null;
});

ponder.on("Gateway:UnderpaidBatch", async ({ event, context }) => {
  logEvent(event, context, "Gateway:UnderpaidBatch");
  const { centrifugeId: toCentrifugeId, batch } = event.args;
  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const payloadId = getPayloadId(
    fromCentrifugeId,
    toCentrifugeId.toString(),
    batch
  );

  const alreadyInitialized = await CrosschainPayloadService.getUnderpaidFromQueue(
    context,
    payloadId
  );
  if (alreadyInitialized) {
    logEvent(event, context, `UnderpaidBatch already initialized for payloadId ${payloadId}`);
    return;
  }

  const payloadIndex = await CrosschainPayloadService.count(context, {
    id: payloadId,
  });

  const poolIdSet = new Set<bigint>();
  const messages = extractMessagesFromPayload(batch);
  for (const message of messages) {
    const messageBuffer = Buffer.from(message.substring(2), "hex");
    const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0));
    const messagePayload = messageBuffer.subarray(1);

    const messageId = getMessageId(
      fromCentrifugeId,
      toCentrifugeId.toString(),
      message
    );

    const pendingMessage = await CrosschainMessageService.getFromAwaitingBatchDeliveryQueue(context, messageId);
    if (pendingMessage) {
      logEvent(event, context, `Message ${messageId} already initialized in awaiting batch delivery queue`);
      pendingMessage.setPayloadId(payloadId, payloadIndex);
      await pendingMessage.save(event.block);
      continue;
    }

    const messageIndex = await CrosschainMessageService.count(context, {
      id: messageId,
    });

    const rawData = `0x${Buffer.from(
      messageBuffer.toString("hex")
    )}` as `0x${string}`;

    const data = decodeMessage(messageType, messagePayload);
    if (!data) {
      console.error(`Failed to decode message for messageId ${messageId}`);
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
      event.block
    )) as CrosschainMessageService | null;
  }

  const poolIds = Array.from(poolIdSet);
  if (poolIds.length > 1) {
    console.error(`Multiple poolIds found for payloadId ${payloadId}`);
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
      prepareTxHash: event.transaction.hash,
    },
    event.block
  )) as CrosschainPayloadService | null;
  if (!crosschainPayload) console.error("Failed to initialize crosschain payload ");
});

ponder.on("Gateway:RepayBatch", async ({ event, context }) => {
  logEvent(event, context, "Gateway:RepayBatch");
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
    console.error(
      `CrosschainPayload not found for payloadId ${payloadId}`
    );
    return;
  };
  const { index: payloadIndex } = crosschainPayload.read();
  const crosschainMessages = await CrosschainMessageService.query(context, {
    payloadId: payloadId,
    payloadIndex: payloadIndex,
    status: "Unsent",
  }) as CrosschainMessageService[];
  const crosschainMessageSaves = []
  for (const crosschainMessage of crosschainMessages) {
    crosschainMessage.awaitingBatchDelivery();
    crosschainMessageSaves.push(crosschainMessage.save(event.block));
  }
  await Promise.all(crosschainMessageSaves);

  crosschainPayload.InTransit();
  await crosschainPayload.save(event.block);
});

ponder.on("Gateway:ExecuteMessage", async ({ event, context }) => {
  // RECEIVING CHAIN
  logEvent(event, context, "Gateway:ExecuteMessage");
  const { centrifugeId: fromCentrifugeId, message } = event.args;

  const toCentrifugeId = await BlockchainService.getCentrifugeId(context);
  const messageId = getMessageId(
    fromCentrifugeId.toString(),
    toCentrifugeId,
    message
  );

  const crosschainMessage = await CrosschainMessageService.getFromAwaitingBatchDeliveryOrFailedQueue(
    context,
    messageId
  );
  if (!crosschainMessage) {
    console.error(
      `CrosschainMessage not found in AwaitingBatchDelivery queue for messageId ${messageId}`
    );
    return;
  }

  crosschainMessage.executed(event);
  await crosschainMessage.save(event.block);

  const { payloadId } = crosschainMessage.read();
  if (!payloadId) {
    console.error("Payload ID is required");
    return;
  }

  const crosschainPayload =
    (await CrosschainPayloadService.getDeliveredOrPartiallyFailedFromQueue(
      context,
      payloadId
    )) as CrosschainPayloadService | null;
  if (!crosschainPayload) {
    console.error(`CrosschainPayload not found in Delivered queue for payloadId ${payloadId}`);
    return;
  }
  const { index: payloadIndex } = crosschainPayload.read();

  const isPayloadFullyExecuted = await CrosschainMessageService.checkPayloadFullyExecuted(context, payloadId, payloadIndex);
  if (!isPayloadFullyExecuted) return;

  crosschainPayload.completed(event);
  await crosschainPayload.save(event.block);
});

ponder.on("Gateway:FailMessage", async ({ event, context }) => {
  // RECEIVING CHAIN
  logEvent(event, context, "Gateway:FailMessage");
  const { centrifugeId: fromCentrifugeId, message } = event.args;

  const toCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const messageId = getMessageId(
    fromCentrifugeId.toString(),
    toCentrifugeId,
    message
  );

  const crosschainMessage = await CrosschainMessageService.getFromAwaitingBatchDeliveryOrFailedQueue(
    context,
    messageId
  );
  if (!crosschainMessage) {
    console.error(
      `CrosschainMessage not found in AwaitingBatchDelivery or Failed queue for messageId ${messageId}`
    );
    return;
  }

  const { status } = crosschainMessage.read();
  if (status === "Failed") return;

  crosschainMessage.setStatus('Failed');
  await crosschainMessage.save(event.block);

  const { payloadId } = crosschainMessage.read();
  if (!payloadId) throw new Error("Payload ID is required");

  const crosschainPayload =
    (await CrosschainPayloadService.getDeliveredFromQueue(
      context,
      payloadId
    )) as CrosschainPayloadService | null;
  if (!crosschainPayload) {
    console.error(`CrosschainPayload not found in Delivered queue for payloadId ${payloadId}`);
    return;
  }

  crosschainPayload.setStatus("PartiallyFailed");
  await crosschainPayload.save(event.block);
});