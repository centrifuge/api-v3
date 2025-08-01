import { XChainMessage } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { XChainMessageStatuses } from "ponder:schema";
import { encodePacked, keccak256 } from "viem";
import { Event } from "ponder:registry";

/**
 * Service class for managing XChainMessage entities.
 *
 * This service handles operations related to XChainMessage entities,
 * including creation, updating, and querying.
 *
 * @extends {Service<typeof XChainMessage>}
 */
export class XChainMessageService extends mixinCommonStatics(
  Service<typeof XChainMessage>,
  XChainMessage,
  "XChainMessage"
) {

  /**
   * Sets the status of the XChainMessage
   * @param status - The new status to set. Must be one of the valid XChainMessageStatuses
   * @returns The XChainMessageService instance for chaining
   */
  public setStatus(status: (typeof XChainMessageStatuses)[number]) {
    this.data.status = status;
    return this
  }

  /**
   * Sets the payload ID for the XChainMessage
   * @param payloadId - The hex string payload ID to set
   * @returns The XChainMessageService instance for chaining
   */
  public setPayloadId(payloadId: `0x${string}`) {   
    this.data.payloadId = payloadId;
    return this
  }

  /**
   * Marks the XChainMessage as executed.
   * 
   * @param {Event} event - The event that marks the XChainMessage as executed
   * @returns {XChainMessageService} Returns the current instance for method chaining
   */
  public executed(event: Event) {
    this.data.status = "Executed";
    this.data.executedAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.executedAtBlock = Number(event.block.number);
    return this
  }
}

export const XChainMessageType = {
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
  UpdateRestriction: 25,
  UpdateContract: 57,
  UpdateVault: 74,
  UpdateBalanceSheetManager: 42,
  UpdateHoldingAmount: 91,
  UpdateShares: 59,
  MaxAssetPriceAge: 49,
  MaxSharePriceAge: 33,
  Request: 41,
  RequestCallback: 41,
  SetRequestManager: 73,
} as const;

/**
 * Gets the string name of a cross-chain message type from its numeric ID
 * @param messageType - The numeric ID of the message type
 * @returns The string name of the message type from XChainMessageType
 */

/**
 * Gets the length in bytes of a cross-chain message type's payload
 * @param messageType - The numeric ID of the message type
 * @returns The expected payload length in bytes for that message type
 */
export function getXChainMessageType(messageType: number) {
  return Object.keys(XChainMessageType)[messageType] ?? "_Invalid";
}

/**
 * Gets the string name of a cross-chain message type from its numeric ID
 * @param messageType - The numeric ID of the message type 
 * @returns The string name of the message type from XChainMessageType
 */
export function getXChainMessageLength(messageType: number) {
  return Object.values(XChainMessageType)[messageType];
}

/**
 * Generates a unique message ID by hashing chain IDs and message bytes
 * 
 * @param sourceChainId - The Centrifuge Chain ID of the source chain
 * @param destChainId - The Centrifuge Chain ID of the destination chain  
 * @param messageBytes - The hex-encoded message bytes
 * @returns The keccak256 hash of the encoded parameters as the message ID
 */
export function getMessageId(sourceCentrifugeId: string, destCentrifugeId: string, messageBytes: `0x${string}`) {
  
  const messageId = keccak256(encodePacked(['uint16', 'uint16', 'bytes'],
    [Number(sourceCentrifugeId), Number(destCentrifugeId), messageBytes]));
  return messageId;
}


