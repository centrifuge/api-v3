import { encodePacked, Hex, toHex } from "viem";

export enum MessageType {
  _Invalid,
  ScheduleUpgrade,
  CancelUpgrade,
  RecoverTokens,
  RegisterAsset,
  SetPoolAdapters,
  NotifyPool,
  NotifyShareClass,
  NotifyPricePoolPerShare,
  NotifyPricePoolPerAsset,
  NotifyShareMetadata,
  UpdateShareHook,
  InitiateTransferShares,
  ExecuteTransferShares,
  UpdateRestriction,
  UpdateVault,
  UpdateBalanceSheetManager,
  UpdateGatewayManager,
  UpdateHoldingAmount,
  UpdateShares,
  SetMaxAssetPriceAge,
  SetMaxSharePriceAge,
  Request,
  RequestCallback,
  SetRequestManager,
  TrustedContractUpdate,
  UntrustedContractUpdate,
}

/**
 * Creates an empty encoded message for getting gas estimates
 * @param type - The message type from the MessageType enum
 * @param poolId - The pool ID to include in the message if needed
 * @returns The encoded empty message bytes
 */
export function emptyMessage(type: MessageType, poolId = 0n): Hex {
  return encodePacked(
    ["uint8", "uint64", "bytes"],
    [type, poolId, toHex(0, { size: 241 })],
  );
}
