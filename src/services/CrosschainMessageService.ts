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
  UpdateRestriction: (message: Buffer) => {
    const baseLength = 25;
    const payloadLength = message.readUint16BE(baseLength);
    return baseLength + 2 + payloadLength;
  },
  UpdateContract: (message: Buffer) => {
    const baseLength = 57;
    const payloadLength = message.readUint16BE(baseLength);
    return baseLength + 2 + payloadLength;
  },
  UpdateVault: 74,
  UpdateBalanceSheetManager: 42,
  UpdateHoldingAmount: 91,
  UpdateShares: 59,
  MaxAssetPriceAge: 49,
  MaxSharePriceAge: 33,
  Request: (message: Buffer) => {
    const baseLength = 41;
    const payloadLength = message.readUint16BE(baseLength);
    return baseLength + 2 + payloadLength;
  },
  RequestCallback: (message: Buffer) => {
    const baseLength = 41;
    const payloadLength = message.readUint16BE(baseLength);
    return baseLength + 2 + payloadLength;
  },
  SetRequestManager: 73,
} as const;

/**
 * Gets the string name of a cross-chain message type from its numeric ID
 * @param messageType - The numeric ID of the message type
 * @returns The string name of the message type from CrosschainMessageType
 */
export function getCrosschainMessageType(messageType: number) {
  return Object.keys(CrosschainMessageType)[messageType] ?? "_Invalid";
}

/**
 * Gets the string name of a cross-chain message type from its numeric ID
 * @param messageType - The numeric ID of the message type
 * @returns The string name of the message type from CrosschainMessageType
 */
export function getCrosschainMessageLength(messageType: number, message: Buffer) {
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
