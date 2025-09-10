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
import { keccak256 } from "viem";

ponder.on("Gateway:PrepareMessage", async ({ event, context }) => {
  logEvent(event, context, "Gateway:PrepareMessage");
  const { centrifugeId: toCentrifugeId, poolId, message } = event.args;
  const messageBuffer = Buffer.from(message.substring(2), "hex");
  const messageHash = keccak256(messageBuffer);
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
      messageHash,
      messageType: messageType,
      rawData,
      data: data,
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

  const poolIdSet = new Set<bigint>();
  const messages = extractMessagesFromPayload(batch);
  for (const message of messages) {
    const messageBuffer = Buffer.from(message.substring(2), "hex");
    const messageHash = keccak256(messageBuffer);
    const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0));
    const messagePayload = messageBuffer.subarray(1);

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
    if (!data) {
      console.error(`Failed to decode message for messageId ${messageId}`);
      return;
    }

    const poolId = "poolId" in data ? BigInt(data.poolId!) : null;
    if (poolId) poolIdSet.add(poolId);

    const _crosschainMessage = (await CrosschainMessageService.insert(context, {
      id: messageId,
      index: messageCount,
      poolId,
      fromCentrifugeId,
      toCentrifugeId: toCentrifugeId.toString(),
      messageHash,
      messageType: messageType,
      rawData,
      data: data,
    }, event.block)) as CrosschainMessageService | null;
  }
  const poolIds = Array.from(poolIdSet);
  if (poolIds.length > 1) {
    console.error(`Multiple poolIds found for payloadId ${payloadId}`);
    return;
  }

  const poolId = Array.from(poolIdSet).pop() ?? null;
  const _crosschainPayload = (await CrosschainPayloadService.insert(context, {
    id: payloadId,
    poolId,
    toCentrifugeId: toCentrifugeId.toString(),
    fromCentrifugeId: fromCentrifugeId,
    status: "Underpaid",
  }, event.block)) as CrosschainPayloadService;
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

  const crosschainPayload = (await CrosschainPayloadService.get(context, {
    id: payloadId,
    fromCentrifugeId: fromCentrifugeId,
    toCentrifugeId: toCentrifugeId.toString(),
  })) as CrosschainPayloadService;
  if (!crosschainPayload) {
    console.error(
      `CrosschainPayload not found for payloadId ${payloadId} fromCentrifugeId ${fromCentrifugeId} toCentrifugeId ${toCentrifugeId}`
    );
    return;
  }
  crosschainPayload.setStatus("InProgress");
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

  const crosschainMessage = await CrosschainMessageService.getMessageFromQueue(
    context,
    messageId,
    fromCentrifugeId.toString(),
    toCentrifugeId
  );
  if (!crosschainMessage) {
    console.error(
      `CrosschainMessage not found for messageId ${messageId} fromCentrifugeId ${fromCentrifugeId} toCentrifugeId ${toCentrifugeId}`
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

  const crosschainPayload = (await CrosschainPayloadService.get(context, {
    id: payloadId,
    fromCentrifugeId: fromCentrifugeId.toString(),
    toCentrifugeId: toCentrifugeId,
  })) as CrosschainPayloadService | null;
  if (!crosschainPayload) {
    console.error("CrosschainPayload not found");
    return;
  }
  const { status } = crosschainPayload.read();
  if (status === "Delivered") return;
  const countFailedPayloadMessages = await CrosschainMessageService.count(
    context,
    {
      payloadId,
      fromCentrifugeId: fromCentrifugeId.toString(),
      toCentrifugeId: toCentrifugeId,
      status: "Failed",
    }
  );
  if (countFailedPayloadMessages > 0) return;
  crosschainPayload.delivered(event);
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

  const crosschainMessage = await CrosschainMessageService.getMessageFromQueue(
    context,
    messageId,
    fromCentrifugeId.toString(),
    toCentrifugeId
  );
  if (!crosschainMessage) {
    console.error(
      `CrosschainMessage not found for messageId ${messageId} fromCentrifugeId ${fromCentrifugeId} toCentrifugeId ${toCentrifugeId}`
    );
    return;
  }
  crosschainMessage.setStatus("Failed");
  await crosschainMessage.save(event.block);

  const { payloadId, status } = crosschainMessage.read();
  if (!payloadId) throw new Error("Payload ID is required");

  const crosschainPayload = (await CrosschainPayloadService.get(context, {
    id: payloadId,
    fromCentrifugeId: fromCentrifugeId.toString(),
    toCentrifugeId,
  })) as CrosschainPayloadService;
  if (!crosschainPayload)
    throw new Error(
      `CrosschainPayload not found for payloadId ${payloadId} fromCentrifugeId ${fromCentrifugeId} toCentrifugeId ${toCentrifugeId}`
    );
  // @ts-ignore
  if (status === "PartiallyFailed") return;
  crosschainPayload.setStatus("PartiallyFailed");
  await crosschainPayload.save(event.block);
});
