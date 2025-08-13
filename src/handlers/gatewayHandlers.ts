import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { BlockchainService } from "../services/BlockchainService";
import {
  getCrosschainMessageType,
  CrosschainMessageService,
  getMessageId,
  decodeMessage,
} from "../services/CrosschainMessageService";
import { CrosschainPayloadService } from "../services/CrosschainPayloadService";
import { encodePacked, keccak256 } from "viem";

ponder.on("Gateway:PrepareMessage", async ({ event, context }) => {
  logEvent(event, context, "Gateway:PrepareMessage");
  const { centrifugeId: toCentrifugeId, poolId, message } = event.args;
  const messageBuffer = Buffer.from(message.substring(2), "hex");
  const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0));
  const messagePayload = messageBuffer.subarray(1);

  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId: fromCentrifugeId } = blockchain.read();

  const messageId = getMessageId(
    fromCentrifugeId,
    toCentrifugeId.toString(),
    message
  );
  const messageCount = await CrosschainMessageService.count(context, {
    id: messageId,
  });

  const rawData = `0x${Buffer.from(
    messagePayload.toString("hex")
  )}` as `0x${string}`;
  const data = decodeMessage(messageType, messagePayload);

  const _crosschainMessage = (await CrosschainMessageService.init(context, {
    id: messageId,
    index: messageCount,
    poolId: poolId || null,
    fromCentrifugeId,
    toCentrifugeId: toCentrifugeId.toString(),
    messageType: messageType,
    rawData,
    data: data,
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
  })) as CrosschainMessageService | null;
});

ponder.on("Gateway:UnderpaidBatch", async ({ event, context }) => {
  logEvent(event, context, "Gateway:UnderpaidBatch");
  const { centrifugeId: toCentrifugeId, batch } = event.args;
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId: fromCentrifugeId } = blockchain.read();

  const _crosschainPayload = (await CrosschainPayloadService.init(context, {
    id: batch,
    toCentrifugeId: toCentrifugeId.toString(),
    fromCentrifugeId: fromCentrifugeId,
    status: "Underpaid",
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
  })) as CrosschainPayloadService;
});

ponder.on("Gateway:RepayBatch", async ({ event, context }) => {
  logEvent(event, context, "Gateway:RepayBatch");
  const { centrifugeId: toCentrifugeId, batch } = event.args;
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId: fromCentrifugeId } = blockchain.read();

  const payloadId = keccak256(
    encodePacked(
      ["uint16", "uint16", "bytes32"],
      [Number(fromCentrifugeId), toCentrifugeId, keccak256(batch)]
    )
  );

  const crosschainPayload = (await CrosschainPayloadService.get(context, {
    id: payloadId,
    fromCentrifugeId: fromCentrifugeId,
    toCentrifugeId: toCentrifugeId.toString(),
  })) as CrosschainPayloadService;
  if (!crosschainPayload) throw new Error("CrosschainPayload not found");
  crosschainPayload.setStatus("InProgress");
  await crosschainPayload.save();
});

ponder.on("Gateway:ExecuteMessage", async ({ event, context }) => {
  // RECEIVING CHAIN
  logEvent(event, context, "Gateway:ExecuteMessage");
  const { centrifugeId: fromCentrifugeId, message } = event.args;
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId: toCentrifugeId } = blockchain.read();

  const messageId = getMessageId(
    fromCentrifugeId.toString(),
    toCentrifugeId,
    message
  );
  const crosschainMessages = (await CrosschainMessageService.query(context, {
    id: messageId,
    status_not: "Executed",
  })) as CrosschainMessageService[];
  if (crosschainMessages.length === 0) {
    console.log(
      "CrosschainMessage not found maybe source chain is not connected to this centrifuge? from centrifugeId",
      fromCentrifugeId
    );
    return;
  }
  crosschainMessages.sort((a, b) => a.read().index - b.read().index);
  const crosschainMessage = crosschainMessages.shift()!;
  crosschainMessage.executed(event);
  await crosschainMessage.save();

  const { payloadId } = crosschainMessage.read();
  if (!payloadId) {
    console.error("Payload ID is required");
    return;
  }

  const crosschainPayload = (await CrosschainPayloadService.get(context, {
    id: payloadId,
  })) as CrosschainPayloadService | null;
  if (!crosschainPayload) {
    console.error("CrosschainPayload not found");
    return;
  }
  const { status } = crosschainPayload.read();
  if (status === "Delivered") return;
  const countFailedPayloadMessages = await CrosschainMessageService.count(context, {
    payloadId,
    status: "Failed",
  });
  if (countFailedPayloadMessages > 0) return;
  crosschainPayload.delivered(event);
  await crosschainPayload.save();
});

ponder.on("Gateway:FailMessage", async ({ event, context }) => {
  // RECEIVING CHAIN
  logEvent(event, context, "Gateway:FailMessage");
  const { centrifugeId: fromCentrifugeId, message } = event.args;
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId: toCentrifugeId } = blockchain.read();

  const messageId = getMessageId(
    fromCentrifugeId.toString(),
    toCentrifugeId,
    message
  );
  const crosschainMessages = (await CrosschainMessageService.query(context, {
    id: messageId,
    status: "AwaitingBatchDelivery",
  })) as CrosschainMessageService[];
  if (crosschainMessages.length === 0) {
    console.log(
      "CrosschainMessage not found maybe source chain is not connected to this centrifuge? from centrifugeId",
      fromCentrifugeId
    );
    return;
  }
  crosschainMessages.sort((a, b) => a.read().index - b.read().index);
  const crosschainMessage = crosschainMessages.shift()!;
  crosschainMessage.setStatus("Failed");
  await crosschainMessage.save();

  const { payloadId, status } = crosschainMessage.read();
  if (!payloadId) throw new Error("Payload ID is required");

  const crosschainPayload = (await CrosschainPayloadService.get(context, {
    id: payloadId,
    fromCentrifugeId: fromCentrifugeId.toString(),
    toCentrifugeId,
  })) as CrosschainPayloadService;
  if (!crosschainPayload) throw new Error("CrosschainPayload not found");
  // @ts-ignore
  if (status === "PartiallyFailed") return;
  crosschainPayload.setStatus("PartiallyFailed");
  await crosschainPayload.save();
});
