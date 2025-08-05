import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { BlockchainService } from "../services/BlockchainService";
import {
  CrosschainMessageService,
  getCrosschainMessageLength,
  getMessageId,
} from "../services/CrosschainMessageService";
import { CrosschainPayloadService } from "../services/CrosschainPayloadService";

ponder.on("MultiAdapter:SendPayload", async ({ event, context }) => {
  logEvent(event, context, "MultiAdapter:SendPayload");
  const {
    centrifugeId: toCentrifugeId,
    payload,
    payloadId,
    adapter,
    // adapterData,
    // refund,
  } = event.args;

  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId: fromCentrifugeId } = blockchain.read();

  const _crosschainPayload = (await CrosschainPayloadService.init(context, {
    id: payloadId,
    toCentrifugeId: toCentrifugeId.toString(),
    fromCentrifugeId: fromCentrifugeId,
    status: "InProgress",
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
    adapterSending: adapter,
  })) as CrosschainPayloadService;

  const messages = excractMessagesFromPayload(payload);
  const messageIds = messages.map((message) =>
    getMessageId(fromCentrifugeId, toCentrifugeId.toString(), message)
  );

  for (const messageId of messageIds) {
    const crosschainMessages = (await CrosschainMessageService.query(context, {
      id: messageId,
      payloadId: null,
    })) as CrosschainMessageService[];
    if (crosschainMessages.length === 0)
      throw new Error(`CrosschainMessage with id ${messageId} not found`);
    crosschainMessages.sort((a, b) => a.read().index - b.read().index);
    const crosschainMessage = crosschainMessages.shift()!;
    crosschainMessage.setPayloadId(payloadId);
    await crosschainMessage.save();
  }
});

ponder.on("MultiAdapter:SendProof", async ({ event, context }) => {
  logEvent(event, context, "MultiAdapter:SendProof");
  // TODO: connect payloadHash to right batch and the right payloadId and store adapter
});

ponder.on("MultiAdapter:HandlePayload", async ({ event, context }) => {
  // RECEIVING CHAIN
  logEvent(event, context, "MultiAdapter:HandlePayload");
  const {
    payloadId,
    adapter,
    // adapterData,
    // refund,
    centrifugeId: fromCentrifugeId,
  } = event.args;
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId: toCentrifugeId } = blockchain.read();
  const crosschainPayload = (await CrosschainPayloadService.getOrInit(context, {
    id: payloadId,
    toCentrifugeId: toCentrifugeId,
    fromCentrifugeId: fromCentrifugeId.toString(),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
  })) as CrosschainPayloadService;
  if (!crosschainPayload) throw new Error("CrosschainPayload not found");
  const { status } = crosschainPayload.read();
  if (status === "InProgress") crosschainPayload.delivered(event);
  crosschainPayload.setAdapterReceiving(adapter);
  await crosschainPayload.save();
  //TODO: Increase Votes by 1 and mark this adapter as processed successfully
});

ponder.on("MultiAdapter:HandleProof", async ({ event, context }) => {
  logEvent(event, context, "MultiAdapter:HandleProof"); //RECEIVING CHAIN
  // TODO: increase votes for this batch by one
  // TODO: mark this adapter as processed successfully
});

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
export function excractMessagesFromPayload(payload: `0x${string}`) {
  const payloadBuffer = Buffer.from(payload.substring(2), "hex");
  const messages: `0x${string}`[] = [];
  let offset = 0;
  // Keep extracting messages while we have enough bytes remaining
  while (offset < payloadBuffer.length) {
    const messageType = payloadBuffer.readUInt8(offset);
    const messageLength = getCrosschainMessageLength(messageType);
    if (!messageLength) throw new Error(`Invalid message type: ${messageType}`);

    // Extract message bytes including the type byte
    const messageBytes = payloadBuffer.subarray(offset, offset + messageLength);
    const message = `0x${messageBytes.toString("hex")}` as `0x${string}`;
    console.log("message", message);
    messages.push(message);

    // Move offset past this message
    offset += messageLength;
  }
  return messages;
}
