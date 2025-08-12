import { CrosschainMessage } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { CrosschainMessageStatuses } from "ponder:schema";
import { encodePacked, keccak256 } from "viem";
import { Event } from "ponder:registry";

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
   * @returns The CrosschainMessageService instance for chaining
   */
  public setPayloadId(payloadId: `0x${string}`) {
    this.data.payloadId = payloadId;
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

// eslint-disable-next-line no-unused-vars
type BufferDecoderFunction<T = unknown> = (m: Buffer<ArrayBuffer>) => T;

const MessageDecoders = {
  uint8: (m) => m.readUInt8(),
  uint16: (m) => m.readUInt16BE(),
  uint64: (m) => m.readBigUInt64BE().toString(),
  uint128: (m) => {
    const low = m.readBigUInt64BE(0);
    const high = m.readBigUInt64BE(8);
    return ((high << 64n) | low).toString();
  },
  uint256: (m) => {
    const lowest = m.readBigUInt64BE(0);
    const low = m.readBigUInt64BE(8);
    const high = m.readBigUInt64BE(16);
    const highest = m.readBigUInt64BE(24);
    return ((highest << 192n) | (high << 128n) | (low << 64n) | lowest).toString();
  },
  bytes16: (m) => `0x${m.toString("hex").padEnd(32, "0")}`,
  bytes32: (m) => `0x${m.toString("hex").padEnd(64, "0")}`,
  string: (m) => m.toString("utf-8").replace(/\0+$/, ""),
  bytes: (m) => `0x${m.toString("hex")}`,
} as const satisfies Record<string, BufferDecoderFunction>;

// eslint-disable-next-line no-unused-vars
interface DecoderConfig {
  name: string;
  decoder: keyof typeof MessageDecoders;
  length: number;
}

// Type mapping for decoder return types - derived from MessageDecoders
type DecoderReturnTypes = {
  [K in keyof typeof MessageDecoders]: ReturnType<typeof MessageDecoders[K]>;
};

// Type that maps message type names to their decoded parameter types
type DecodedMessageTypes = {
  [K in keyof typeof messageDecoders]: {
    [P in typeof messageDecoders[K][number] as P['name']]: DecoderReturnTypes[P['decoder']];
  };
};

const messageDecoders = {
  _Invalid: [],
  ScheduleUpgrade: [
    { name: "target", decoder: "bytes32", length: 32 }
  ],
  CancelUpgrade: [
    { name: "target", decoder: "bytes32", length: 32 }
  ],
  RecoverTokens: [
    { name: "target", decoder: "bytes32", length: 32 },
    { name: "token", decoder: "bytes32", length: 32 },
    { name: "tokenId", decoder: "uint256", length: 32 },
    { name: "to", decoder: "bytes32", length: 32 },
    { name: "amount", decoder: "uint256", length: 32 }
  ],
  RegisterAsset: [
    { name: "assetId", decoder: "uint128", length: 16 },
    { name: "decimals", decoder: "uint8", length: 1 }
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
  NotifyPool: [
    { name: "poolId", decoder: "uint64", length: 8 }
  ],
  NotifyShareClass: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "name", decoder: "string", length: 128 },
    { name: "symbol", decoder: "bytes32", length: 32 },
    { name: "decimals", decoder: "uint8", length: 1 },
    { name: "salt", decoder: "bytes32", length: 32 },
    { name: "hook", decoder: "bytes32", length: 32 }
  ],
  NotifyPricePoolPerShare: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "price", decoder: "uint128", length: 16 },
    { name: "timestamp", decoder: "uint64", length: 8 }
  ],
  NotifyPricePoolPerAsset: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "assetId", decoder: "uint128", length: 16 },
    { name: "price", decoder: "uint128", length: 16 },
    { name: "timestamp", decoder: "uint64", length: 8 }
  ],
  NotifyShareMetadata: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "name", decoder: "string", length: 128 },
    { name: "symbol", decoder: "bytes32", length: 32 }
  ],
  UpdateShareHook: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "hook", decoder: "bytes32", length: 32 }
  ],
  InitiateTransferShares: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "centrifugeId", decoder: "uint16", length: 2 },
    { name: "receiver", decoder: "bytes32", length: 32 },
    { name: "amount", decoder: "uint128", length: 16 },
    { name: "extraGasLimit", decoder: "uint128", length: 16 }
  ],
  ExecuteTransferShares: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "receiver", decoder: "bytes32", length: 32 },
    { name: "amount", decoder: "uint128", length: 16 }
  ],
  UpdateRestriction: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "payload", decoder: "bytes", length: 0 } // Dynamic length
  ],
  UpdateContract: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "target", decoder: "bytes32", length: 32 },
    { name: "payload", decoder: "bytes", length: 0 } // Dynamic length
  ],
  UpdateVault: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "kind", decoder: "uint8", length: 1 },
    { name: "target", decoder: "bytes32", length: 32 },
    { name: "payload", decoder: "bytes", length: 0 } // Dynamic length
  ],
  UpdateBalanceSheetManager: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "target", decoder: "bytes32", length: 32 },
    { name: "payload", decoder: "bytes", length: 0 } // Dynamic length
  ],
  UpdateHoldingAmount: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "assetId", decoder: "uint128", length: 16 },
    { name: "amount", decoder: "uint128", length: 16 },
    { name: "timestamp", decoder: "uint64", length: 8 }
  ],
  UpdateShares: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "amount", decoder: "uint128", length: 16 },
    { name: "timestamp", decoder: "uint64", length: 8 }
  ],
  MaxAssetPriceAge: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "maxAge", decoder: "uint64", length: 8 }
  ],
  MaxSharePriceAge: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "maxAge", decoder: "uint64", length: 8 }
  ],
  Request: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "assetId", decoder: "uint128", length: 16 },
    { name: "payload", decoder: "bytes", length: 0 } // Dynamic length
  ],
  RequestCallback: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "assetId", decoder: "uint128", length: 16 },
    { name: "payload", decoder: "bytes", length: 0 } // Dynamic length
  ],
  SetRequestManager: [
    { name: "poolId", decoder: "uint64", length: 8 },
    { name: "scId", decoder: "bytes16", length: 16 },
    { name: "target", decoder: "bytes32", length: 32 },
    { name: "payload", decoder: "bytes", length: 0 } // Dynamic length
  ]
} as const satisfies Record<keyof typeof CrosschainMessageType, DecoderConfig[]>;



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
    const decoder = MessageDecoders[spec.decoder];
    if (!decoder) {
      console.error(`Invalid decoder: ${spec.decoder}`);
      return null;
    }
    const value = decoder(messageBuffer.subarray(offset, offset + spec.length));
    (decodedData as any)[spec.name] = value;
    offset += spec.length;
  }
  return decodedData;
}
