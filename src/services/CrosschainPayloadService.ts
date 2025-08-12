import { CrosschainPayload, CrosschainPayloadStatuses } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { Event } from "ponder:registry";
import { getCrosschainMessageLength } from ".";

/**
 * Service class for managing CrosschainPayload entities.
 *
 * This service handles operations related to CrosschainPayload entities,
 * including creation, updating, and querying.
 *
 * @extends {Service<typeof CrosschainPayload>}
 */
export class CrosschainPayloadService extends mixinCommonStatics(
  Service<typeof CrosschainPayload>,
  CrosschainPayload,
  "CrosschainPayload"
) {

  /**
   * Sets the status of the CrosschainPayload entity.
   * 
   * @param {CrosschainPayloadStatuses} status - The new status to set for the CrosschainPayload
   * @returns {CrosschainPayloadService} Returns the current instance for method chaining
   */
  public setStatus(status: (typeof CrosschainPayloadStatuses)[number]) {
    this.data.status = status;
    return this;
  }

  /**
   * Marks the CrosschainPayload as delivered.
   * 
   * @param {Event} event - The event that marks the CrosschainPayload as delivered
   * @returns {CrosschainPayloadService} Returns the current instance for method chaining
   */
  public delivered(event: Event) {
    this.data.status = "Delivered";
    this.data.deliveredAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.deliveredAtBlock = Number(event.block.number);
    return this;
  }

  /**
   * Sets the adapter that sent the CrosschainPayload.
   * 
   * @param {string} adapter - The adapter that sent the CrosschainPayload
   * @returns {CrosschainPayloadService} Returns the current instance for method chaining
   */
  public setAdapterSending(adapter: `0x${string}`) {
    this.data.adapterSending = adapter;
    return this;
  }

  /**
   * Sets the adapter that received the CrosschainPayload.
   * 
   * @param {string} adapter - The adapter that received the CrosschainPayload
   * @returns {CrosschainPayloadService} Returns the current instance for method chaining
   */
  public setAdapterReceiving(adapter: `0x${string}`) {
    this.data.adapterReceiving = adapter;
    return this;
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
export function excractMessagesFromPayload(payload: `0x${string}`) {
  const payloadBuffer = Buffer.from(payload.substring(2), "hex");
  const messages: `0x${string}`[] = [];
  let offset = 0;
  // Keep extracting messages while we have enough bytes remaining
  while (offset < payloadBuffer.length) {
    const messageType = payloadBuffer.readUInt8(offset);
    // Pass the buffer slice starting from current offset
    const currentBuffer = payloadBuffer.subarray(offset);
    const messageLength = getCrosschainMessageLength(
      messageType,
      currentBuffer
    );
    if (!messageLength) {
      console.error(`Invalid message type: ${messageType}`);
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
