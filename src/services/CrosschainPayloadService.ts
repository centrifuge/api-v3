import { CrosschainPayload, CrosschainPayloadStatuses } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { Event, Context } from "ponder:registry";
import { getCrosschainMessageLength } from ".";
import { keccak256, encodePacked } from "viem";


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
   * Gets the first payload from the queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getUndeliveredFromQueue(context: Context, payloadId: `0x${string}`) {
    const crosschainMessages = (await this.query(context, {
      id: payloadId,
      status_not: "Delivered",
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainMessages.length === 0) return null;
    return crosschainMessages.shift()!;
  }

  /**
   * Gets the first payload from the queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getInTransitFromQueue(context: Context, payloadId: `0x${string}`) {
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status: "InTransit",
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }

  /**
   * Gets the first payload from the queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getUnderpaidFromQueue(context: Context, payloadId: `0x${string}`) {
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status: "Underpaid",
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    
    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }

  /**
   * Gets the first payload from the queue for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to get from the queue
   * @returns The first payload from the queue or null if no payload is found
   */
  static async getDeliveredFromQueue(context: Context, payloadId: `0x${string}`) {
    const crosschainPayloads = (await this.query(context, {
      id: payloadId,
      status: "Delivered",
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainPayloadService[];
    if (crosschainPayloads.length === 0) return null;
    return crosschainPayloads.shift()!;
  }

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
   * Marks the CrosschainPayload as completed.
   * 
   * @param {Event} event - The event that marks the CrosschainPayload as completed
   * @returns {CrosschainPayloadService} Returns the current instance for method chaining
   */
  public completed(event: Event) {
    this.data.status = "Completed";
    this.data.completedAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.completedAtBlock = Number(event.block.number);
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
export function extractMessagesFromPayload(payload: `0x${string}`) {
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

/**
 * Generates a unique payload ID by hashing chain IDs and payload bytes
 *
 * @param fromCentrifugeId - The Centrifuge Chain ID of the source chain
 * @param toCentrifugeId - The Centrifuge Chain ID of the destination chain
 * @param payload - The hex-encoded payload bytes
 * @returns The keccak256 hash of the encoded parameters as the payload ID
 */
export function getPayloadId(fromCentrifugeId: string, toCentrifugeId: string, payload: `0x${string}`) {
  return keccak256(
    encodePacked(
      ["uint16", "uint16", "bytes32"],
      [Number(fromCentrifugeId), Number(toCentrifugeId), keccak256(payload)]
    )
  );
}
