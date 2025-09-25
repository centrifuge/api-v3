import { CrosschainMessage, CrosschainMessageStatuses } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { encodePacked, keccak256 } from "viem";
import { Event, Context } from "ponder:registry";

/**
 * Service class for managing CrosschainMessage entities.
 *
 * This service handles operations related to CrosschainMessage entities,
 * including creation, updating, and querying.
 *
 * @extends {Service<typeof CrosschainMessage>}
 */
export class CrosschainMessageService extends mixinCommonStatics(
  Service<typeof CrosschainMessage>,
  CrosschainMessage,
  "CrosschainMessage"
) {
  /**
   * Gets the first message from the awaiting batch delivery queue for a given message ID
   * @param context - The database and client context
   * @param messageId - The ID of the message to get from the queue
   * @returns The first message from the queue or null if no message is found
   */
  static async getFromAwaitingBatchDeliveryQueue(context: Context, messageId: `0x${string}`) {
    const crosschainMessages = (await CrosschainMessageService.query(context, {
      id: messageId,
      status: "AwaitingBatchDelivery",
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainMessageService[];
    if (crosschainMessages.length === 0) return null;
    return crosschainMessages.shift()!;
  }

  /**
   * Gets the first message from the awaiting batch delivery or failed queue for a given message ID
   * @param context - The database and client context
   * @param messageId - The ID of the message to get from the queue
   * @returns The first message from the queue or null if no message is found
   */
  static async getFromAwaitingBatchDeliveryOrFailedQueue(context: Context, messageId: `0x${string}`) {
    const crosschainMessages = (await CrosschainMessageService.query(context, {
      id: messageId,
      status_in: ["AwaitingBatchDelivery", "Failed"],
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainMessageService[];
    if (crosschainMessages.length === 0) return null;
    return crosschainMessages.shift()!;
  }

  /**
   * Counts the number of failed messages for a given message ID
   * @param context - The database and client context
   * @param messageId - The ID of the message to count failed messages for
   * @returns The number of failed messages
   */
  static async countPayloadFailedMessages(context: Context, payloadId: `0x${string}`, payloadIndex: number) {
    return await CrosschainMessageService.count(context, {
      payloadId,
      payloadIndex,
      status: "Failed"
    });
  }

  /**
   * Counts the number of executed messages for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to count executed messages for
   * @returns The number of executed messages
   */
  static async countPayloadExecutedMessages(context: Context, payloadId: `0x${string}`, payloadIndex: number) {
    return await CrosschainMessageService.count(context, {
      payloadId,
      payloadIndex,
      status: "Executed"
    });
  }

  /**
   * Counts the number of messages for a given payload ID
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to count messages for
   * @returns The number of messages
   */
  static async countPayloadMessages(context: Context, payloadId: `0x${string}`, payloadIndex: number) {
    return await CrosschainMessageService.count(context, {
      payloadId,
      payloadIndex,
    });
  }

  /**
   * Links outstanding messages to a payload
   * @param context - The database and client context
   * @param event - The event that links the messages to the payload
   * @param messageIds - The IDs of the messages to link to the payload
   * @param payloadId - The ID of the payload to link the messages to
   * @param payloadIndex - The index of the payload to link the messages to
   */
  static async linkMessagesToPayload(context: Context, event: Event, messageIds: `0x${string}`[], payloadId: `0x${string}`, payloadIndex: number) {
    const crosschainMessageSaves = [];
    const poolIdSet = new Set<bigint>();
    for (const messageId of messageIds) {
      const crosschainMessages = (await CrosschainMessageService.query(context, {
        id: messageId,
        payloadId: null,
        payloadIndex: null,
        _sort: [{ field: "index", direction: "asc" }],
      })) as CrosschainMessageService[];
      if (crosschainMessages.length === 0) {
        console.error(`CrosschainMessage with id ${messageId} not found`);
        continue;
      }
      const crosschainMessage = crosschainMessages.shift()!;
      const { poolId } = crosschainMessage.read();
      crosschainMessage.setPayloadId(payloadId, payloadIndex);
      crosschainMessageSaves.push(crosschainMessage.save(event.block));
      if (poolId) poolIdSet.add(poolId);
    }
    await Promise.all(crosschainMessageSaves);
    const poolIds = Array.from(poolIdSet);
    if (poolIds.length > 1) throw new Error("Multiple pools found among messages");
    return poolIds.pop() ?? null;
  }

  /**
   * Sets the status of the CrosschainMessage
   * @param status - The new status to set. Must be one of the valid CrosschainMessageStatuses
   * @returns The CrosschainMessageService instance for chaining
   */
  public setStatus(status: (typeof CrosschainMessageStatuses)[number]) {
    this.data.status = status;
    return this;
  }

  /**
   * Sets the payload ID for the CrosschainMessage
   * @param payloadId - The hex string payload ID to set
   * @param payloadIndex - The index of the payload to set
   * @returns The CrosschainMessageService instance for chaining
   */
  public setPayloadId(payloadId: `0x${string}`, payloadIndex: number) {
    this.data.payloadId = payloadId;
    this.data.payloadIndex = payloadIndex;
    return this;
  }

  /**
   * Marks the CrosschainMessage as executed.
   *
   * @param {Event} event - The event that marks the CrosschainMessage as executed
   * @returns {CrosschainMessageService} Returns the current instance for method chaining
   */
  public executed(event: Event) {
    this.data.status = "Executed";
    this.data.executedAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.executedAtBlock = Number(event.block.number);
    return this;
  }

  /**
   * Marks the CrosschainMessage as awaiting batch delivery.
   *
   * @returns {CrosschainMessageService} Returns the current instance for method chaining
   */
  public awaitingBatchDelivery() {
    this.data.status = "AwaitingBatchDelivery";
    return this;
  }
}

const CrosschainMessageType = {
  /// @dev Placeholder for null message type
  _Invalid: undefined,
  // -- Pool independent messages
  ScheduleUpgrade: 33,
  CancelUpgrade: 33,
  RecoverTokens: 161,
  RegisterAsset: 18,
  _Placeholder5: 0,
  _Placeholder6: 0,
  _Placeholder7: 0,
  _Placeholder8: 0,
  _Placeholder9: 0,
  _Placeholder10: 0,
  _Placeholder11: 0,
  _Placeholder12: 0,
  _Placeholder13: 0,
  _Placeholder14: 0,
  _Placeholder15: 0,
  // -- Pool dependent messages
  NotifyPool: 9,
  NotifyShareClass: 250,
  NotifyPricePoolPerShare: 49,
  NotifyPricePoolPerAsset: 65,
  NotifyShareMetadata: 185,
  UpdateShareHook: 57,
  InitiateTransferShares: 91,
  ExecuteTransferShares: 73,
  UpdateRestriction: dynamicLengthDecoder(25),
  UpdateContract: dynamicLengthDecoder(57),
  UpdateVault: 74,
  UpdateBalanceSheetManager: 42,
  UpdateHoldingAmount: 91,
  UpdateShares: 59,
  MaxAssetPriceAge: 49,
  MaxSharePriceAge: 33,
  Request: dynamicLengthDecoder(41),
  RequestCallback: dynamicLengthDecoder(41),
  SetRequestManager: 73,
} as const;

type BufferDecoderEntry<T = unknown> = [decoder: (_m: Buffer<ArrayBuffer>) => T, length: number];

const MessageDecoders = {
  uint8: [(m) => m.readUInt8(), 1],
  uint16: [(m) => m.readUInt16BE(), 2],
  uint64: [(m) => m.readBigUInt64BE().toString(), 8],
  uint128: [(m) => {
    const high = m.readBigUInt64BE(0);  // Bytes 0-7 (upper 64 bits)
    const low = m.readBigUInt64BE(8);   // Bytes 8-15 (lower 64 bits)
    return ((high << 64n) | low).toString();
  }, 16],
    uint256: [(m) => {
      const highest = m.readBigUInt64BE(0);  // Bytes 0-7 (upper 64 bits)
      const high = m.readBigUInt64BE(8);    // Bytes 8-15 (upper 64 bits)
      const low = m.readBigUInt64BE(16);    // Bytes 16-23 (lower 64 bits)
      const lowest = m.readBigUInt64BE(24); // Bytes 24-31 (lower 64 bits)
      return (
        (highest << 192n) |
        (high << 128n) |
        (low << 64n) |
        lowest
      ).toString();
    }, 32],
  bytes16: [(m) => `0x${m.toString("hex").padEnd(32, "0")}`, 16],
  bytes32: [(m) => `0x${m.toString("hex").padEnd(64, "0")}`, 32],
  string: [(m) => m.toString("utf-8").replace(/\0+$/, ""), 0],
  bytes: [(m) => `0x${m.toString("hex")}`, 0],
} as const satisfies Record<string, BufferDecoderEntry>;

// eslint-disable-next-line no-unused-vars
interface DecoderConfig {
  name: string;
  decoder: keyof typeof MessageDecoders;
}

// Type mapping for decoder return types - derived from MessageDecoders
type DecoderReturnTypes = {
  [K in keyof typeof MessageDecoders]: ReturnType<(typeof MessageDecoders)[K][0]>
};

// Type that maps message type names to their decoded parameter types
type DecodedMessageTypes = {
  [K in keyof typeof messageDecoders]: {
    [P in (typeof messageDecoders)[K][number] as P["name"]]: DecoderReturnTypes[P["decoder"]];
  };
};

const messageDecoders = {
  _Invalid: [],
  ScheduleUpgrade: [{ name: "target", decoder: "bytes32" }],
  CancelUpgrade: [{ name: "target", decoder: "bytes32" }],
  RecoverTokens: [
    { name: "target", decoder: "bytes32" },
    { name: "token", decoder: "bytes32" },
    { name: "tokenId", decoder: "uint256" },
    { name: "to", decoder: "bytes32" },
    { name: "amount", decoder: "uint256" },
  ],
  RegisterAsset: [
    { name: "assetId", decoder: "uint128" },
    { name: "decimals", decoder: "uint8" },
  ],
  _Placeholder5: [],
  _Placeholder6: [],
  _Placeholder7: [],
  _Placeholder8: [],
  _Placeholder9: [],
  _Placeholder10: [],
  _Placeholder11: [],
  _Placeholder12: [],
  _Placeholder13: [],
  _Placeholder14: [],
  _Placeholder15: [],
  NotifyPool: [{ name: "poolId", decoder: "uint64" }],
  NotifyShareClass: [
    { name: "poolId", decoder: "uint64"},
    { name: "scId", decoder: "bytes16" },
    { name: "name", decoder: "string" },
    { name: "symbol", decoder: "bytes32" },
    { name: "decimals", decoder: "uint8" },
    { name: "salt", decoder: "bytes32" },
    { name: "hook", decoder: "bytes32" },
  ],
  NotifyPricePoolPerShare: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "price", decoder: "uint128" },
    { name: "timestamp", decoder: "uint64" },
  ],
  NotifyPricePoolPerAsset: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "assetId", decoder: "uint128" },
    { name: "price", decoder: "uint128" },
    { name: "timestamp", decoder: "uint64" },
  ],
  NotifyShareMetadata: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "name", decoder: "string" },
    { name: "symbol", decoder: "bytes32" },
  ],
  UpdateShareHook: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "hook", decoder: "bytes32" },
  ],
  InitiateTransferShares: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "centrifugeId", decoder: "uint16" },
    { name: "receiver", decoder: "bytes32" },
    { name: "amount", decoder: "uint128" },
    { name: "extraGasLimit", decoder: "uint128" },
  ],
  ExecuteTransferShares: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "receiver", decoder: "bytes32" },
    { name: "amount", decoder: "uint128" },
  ],
  UpdateRestriction: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "payload", decoder: "bytes" }, // Dynamic length
  ],
  UpdateContract: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "target", decoder: "bytes32" },
    { name: "payload", decoder: "bytes" }, // Dynamic length
  ],
  UpdateVault: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "kind", decoder: "uint8" },
    { name: "target", decoder: "bytes32" },
    { name: "payload", decoder: "bytes" }, // Dynamic length
  ],
  UpdateBalanceSheetManager: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "target", decoder: "bytes32" },
    { name: "payload", decoder: "bytes" }, // Dynamic length
  ],
  UpdateHoldingAmount: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "assetId", decoder: "uint128" },
    { name: "amount", decoder: "uint128" },
    { name: "timestamp", decoder: "uint64" },
  ],
  UpdateShares: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "amount", decoder: "uint128" },
    { name: "timestamp", decoder: "uint64" },
  ],
  MaxAssetPriceAge: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "maxAge", decoder: "uint64" },
  ],
  MaxSharePriceAge: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "maxAge", decoder: "uint64" },
  ],
  Request: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "assetId", decoder: "uint128" },
    { name: "payload", decoder: "bytes" }, // Dynamic length
  ],
  RequestCallback: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "assetId", decoder: "uint128" },
    { name: "payload", decoder: "bytes" }, // Dynamic length
  ],
  SetRequestManager: [
    { name: "poolId", decoder: "uint64" },
    { name: "scId", decoder: "bytes16" },
    { name: "target", decoder: "bytes32" },
    { name: "payload", decoder: "bytes" }, // Dynamic length
  ],
} as const satisfies Record<
  keyof typeof CrosschainMessageType,
  DecoderConfig[]
>;

/**
 * Creates a function that decodes the length of a dynamic length message
 * @param baseLength - The base length of the message
 * @returns A function that decodes the length of a dynamic length message
 */
function dynamicLengthDecoder(baseLength: number) {
  return function (message: Buffer) {
    return baseLength + 2 + message.readUint16BE(baseLength);
  };
}

/**
 * Gets the string name of a cross-chain message type from its numeric ID
 * @param messageType - The numeric ID of the message type
 * @returns The string name of the message type from CrosschainMessageType
 */
export function getCrosschainMessageType(messageType: number) {
  return (Object.keys(CrosschainMessageType)[messageType] ??
    "_Invalid") as keyof typeof CrosschainMessageType;
}

/**
 * Gets the string name of a cross-chain message type from its numeric ID
 * @param messageType - The numeric ID of the message type
 * @returns The string name of the message type from CrosschainMessageType
 */
export function getCrosschainMessageLength(
  messageType: number,
  message: Buffer
) {
  const lengthEntry = Object.values(CrosschainMessageType)[messageType];
  return typeof lengthEntry === "function" ? lengthEntry(message) : lengthEntry;
}

/**
 * Generates a unique message ID by hashing chain IDs and message bytes
 *
 * @param sourceChainId - The Centrifuge Chain ID of the source chain
 * @param destChainId - The Centrifuge Chain ID of the destination chain
 * @param messageBytes - The hex-encoded message bytes
 * @returns The keccak256 hash of the encoded parameters as the message ID
 */
export function getMessageId(
  sourceCentrifugeId: string,
  destCentrifugeId: string,
  messageBytes: `0x${string}`
) {
  const messageId = keccak256(
    encodePacked(
      ["uint16", "uint16", "bytes"],
      [Number(sourceCentrifugeId), Number(destCentrifugeId), messageBytes]
    )
  );
  return messageId;
}

/**
 * Decodes a cross-chain message into its parameters
 * @param messageType - The type of the message
 * @param messageBuffer - The buffer containing the message
 * @returns The decoded parameters as a properly typed object
 */
export function decodeMessage<T extends keyof typeof messageDecoders>(
  messageType: T,
  messageBuffer: Buffer<ArrayBuffer>
): DecodedMessageTypes[T] | null {
  const messageSpec = messageDecoders[messageType];
  if (!messageSpec) {
    console.error(`Invalid message type: ${messageType}`);
    return null;
  }

  let offset = 0;
  const decodedData: DecodedMessageTypes[T] = {} as DecodedMessageTypes[T];
  for (const spec of messageSpec) {
    const [decoder, length] = MessageDecoders[spec.decoder];
    if (!decoder) {
      console.error(`Invalid decoder: ${spec.decoder}`);
      return null;
    }
    const value = decoder(messageBuffer.subarray(offset, offset + length));
    (decodedData as any)[spec.name] = value;
    offset += length;
  }
  return decodedData;
}
