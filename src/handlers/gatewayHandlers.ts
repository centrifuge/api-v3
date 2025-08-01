import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { BlockchainService } from "../services/BlockchainService";
import {
  getXChainMessageType,
  XChainMessageService,
  getMessageId,
} from "../services/XChainMessageService";
import { XChainPayloadService } from "../services/XChainPayloadService";

ponder.on("Gateway:PrepareMessage", async ({ event, context }) => {
  logEvent(event, context, "Gateway:PrepareMessage");
  const { centrifugeId: toCentrifugeId, poolId, message } = event.args;
  const [messageType, ...payload] = Buffer.from(message.substring(2), "hex");

  if (!messageType) throw new Error("Message type is required");

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
  const messageCount = await XChainMessageService.count(context, {
    id: messageId,
  });

  const _xChainMessage = (await XChainMessageService.init(context, {
    id: messageId,
    index: messageCount,
    poolId: poolId || null,
    fromCentrifugeId,
    toCentrifugeId: toCentrifugeId.toString(),
    messageType: getXChainMessageType(messageType),
    data: `0x${Buffer.from(payload).toString("hex")}`,
  })) as XChainMessageService;
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

  const _xChainPayload = (await XChainPayloadService.getOrInit(context, {
    id: batch,
    toCentrifugeId: toCentrifugeId.toString(),
    fromCentrifugeId: fromCentrifugeId,
    status: "Underpaid",
  })) as XChainPayloadService;
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

  const xChainPayload = (await XChainPayloadService.get(context, {
    id: batch,
    toCentrifugeId: toCentrifugeId.toString(),
    fromCentrifugeId: fromCentrifugeId,
  })) as XChainPayloadService;
  if (!xChainPayload) throw new Error("XChainPayload not found");
  xChainPayload.setStatus("InProgress");
  await xChainPayload.save();
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
  const xChainMessages = (await XChainMessageService.query(context, {
    id: messageId,
    status: "AwaitingBatchDelivery",
  })) as XChainMessageService[];
  if (xChainMessages.length === 0) {
    console.log(
      "XChainMessage not found maybe source chain is not connected to this centrifuge? from centrifugeId",
      fromCentrifugeId
    );
    return;
  }
  const xChainMessage = xChainMessages.pop()!;
  xChainMessage.setStatus("Executed");
  await xChainMessage.save();
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
  const xChainMessages = (await XChainMessageService.query(context, { id: messageId, status: "AwaitingBatchDelivery" })) as XChainMessageService[];
  if (xChainMessages.length === 0) {
    console.log(
      "XChainMessage not found maybe source chain is not connected to this centrifuge? from centrifugeId",
      fromCentrifugeId
    );
    return;
  }
  const xChainMessage = xChainMessages.pop()!;
  xChainMessage.setStatus("Failed");
  await xChainMessage.save();
});
