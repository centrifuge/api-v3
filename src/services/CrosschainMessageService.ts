import { CrosschainMessage } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { CrosschainMessageStatuses } from "ponder:schema";
import {
  decodeAbiParameters,
  encodePacked,
  keccak256,
} from "viem";
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

const messageDecoders = {
  ScheduleUpgrade: [{ name: "target", type: "bytes32" }],
  CancelUpgrade: [{ name: "target", type: "bytes32" }],
  RecoverTokens: [
    { name: "target", type: "bytes32" },
    { name: "token", type: "bytes32" },
    { name: "tokenId", type: "uint256" },
    { name: "to", type: "bytes32" },
    { name: "amount", type: "uint256" },
  ],
  RegisterAsset: [
    { name: "assetId", type: "uint128" },
    { name: "decimals", type: "uint8" },
  ],
  NotifyPool: [{ name: "poolId", type: "uint64" }],
  NotifyShareClass: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "name", type: "string" },
    { name: "symbol", type: "bytes32" },
    { name: "decimals", type: "uint8" },
    { name: "salt", type: "bytes32" },
    { name: "hook", type: "bytes32" },
  ],
  NotifyPricePoolPerShare: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "price", type: "uint128" },
    { name: "timestamp", type: "uint64" },
  ],
  NotifyPricePoolPerAsset: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "assetId", type: "uint128" },
    { name: "price", type: "uint128" },
    { name: "timestamp", type: "uint64" },
  ],
  NotifyShareMetadata: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "name", type: "string" },
    { name: "symbol", type: "bytes32" },
  ],
  UpdateShareHook: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "hook", type: "bytes32" },
  ],
  InitiateTransferShares: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "centrifugeId", type: "uint16" },
    { name: "receiver", type: "bytes32" },
    { name: "amount", type: "uint128" },
    { name: "extraGasLimit", type: "uint128" },
  ],
  ExecuteTransferShares: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "receiver", type: "bytes32" },
    { name: "amount", type: "uint128" },
  ],
  UpdateRestriction: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "payload", type: "bytes" },
  ],
  UpdateContract: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "target", type: "bytes32" },
    { name: "payload", type: "bytes" },
  ],
  UpdateVault: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "kind", type: "uint8" },
    { name: "target", type: "bytes32" },
    { name: "payload", type: "bytes" },
  ],
  UpdateBalanceSheetManager: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "target", type: "bytes32" },
    { name: "payload", type: "bytes" },
  ],
  UpdateHoldingAmount: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "assetId", type: "uint128" },
    { name: "amount", type: "uint128" },
    { name: "timestamp", type: "uint64" },
  ],
  UpdateShares: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "amount", type: "uint128" },
    { name: "timestamp", type: "uint64" },
  ],
  MaxAssetPriceAge: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "maxAge", type: "uint64" },
  ],
  MaxSharePriceAge: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "maxAge", type: "uint64" },
  ],
  Request: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "assetId", type: "uint128" },
    { name: "payload", type: "bytes" },
  ],
  RequestCallback: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "assetId", type: "uint128" },
    { name: "payload", type: "bytes" },
  ],
  SetRequestManager: [
    { name: "poolId", type: "uint64" },
    { name: "scId", type: "bytes16" },
    { name: "target", type: "bytes32" },
    { name: "payload", type: "bytes" },
  ],
} as const;

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
  return (Object.keys(CrosschainMessageType)[messageType] ?? "_Invalid") as keyof typeof CrosschainMessageType;
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
 * @param message - The hex-encoded message
 * @returns The decoded parameters as key-value pairs
 */
export function decodeMessage(message: `0x${string}`) {
  const messageBuffer = Buffer.from(message.substring(2), "hex");
  const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0));
  if (!messageType) throw new Error("Invalid message type");
  const messageData = messageBuffer.subarray(1);
  const decodedData = decodeAbiParameters(messageDecoders[messageType as keyof typeof messageDecoders], messageData);
  
  // TODO: Use reducer to create key-value pairs with full typing
  
  return decodedData;
}
