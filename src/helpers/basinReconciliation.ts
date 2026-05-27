import type { Context, Event } from "ponder:registry";
import type { BasinConfig } from "../config/basin";
import { formatBytes32ToAddress } from "./formatter";
import { serviceLog } from "./logger";
import { BasinReconciliationWarningService, BasinRedeemRequestService } from "../services";

type TxEvent = Extract<Event, { transaction: { hash: `0x${string}` }; log: { logIndex: number } }>;

/**
 * Inserts a non-fatal `basin_reconciliation_warning` row for ops visibility.
 *
 * @param context - Ponder context
 * @param event - Triggering log (tx hash + log index form the PK)
 * @param params - Warning type, message, optional basin keys
 */
export async function insertBasinReconciliationWarning(
  context: Context,
  event: TxEvent,
  params: {
    type:
      | "batchSumMismatch"
      | "initiateNoSwaps"
      | "completeOrphan"
      | "redeemOrderLinkAmbiguous"
      | "spokeRedeemLinkAmbiguous";
    message: string;
    basinAddress?: `0x${string}`;
    basinRedeemRequestId?: `0x${string}`;
  }
): Promise<void> {
  await BasinReconciliationWarningService.insert(
    context,
    {
      chainId: context.chain.id,
      txHash: event.transaction.hash,
      logIndex: event.log.logIndex,
      type: params.type,
      message: params.message,
      basinAddress: params.basinAddress ?? null,
      basinRedeemRequestId: params.basinRedeemRequestId ?? null,
      blockNumber: Number(event.block.number),
      timestamp: new Date(Number(event.block.timestamp) * 1000),
    },
    event
  );
}

/**
 * Links an open `basin_redeem_request` after `vault:RedeemRequest` from TokenRedeemer (issue point 2).
 *
 * @param context - Ponder context
 * @param event - `vault:RedeemRequest` event
 * @param cfg - Loaded basin config
 */
export async function linkSpokeRedeemIfPending(
  context: Context,
  event: TxEvent,
  cfg: BasinConfig
): Promise<void> {
  const redeemer = formatBytes32ToAddress(cfg.tokenRedeemer);
  const basinAddress = formatBytes32ToAddress(cfg.basinAddress);

  const open = (await BasinRedeemRequestService.query(context, {
    basinAddress,
    state: "INITIATED",
    redeemer,
    linkedRedeemOrderIndex: null,
    tokenId: cfg.tokenId,
    assetId: cfg.assetId,
  })) as BasinRedeemRequestService[];

  if (open.length === 1) {
    const batch = open[0]!;
    batch.linkSpokeRedeem(event);
    await batch.save(event);
    serviceLog(`Basin: linked spoke redeem for request ${batch.read().requestId}`);
    return;
  }

  await insertBasinReconciliationWarning(context, event, {
    type: "spokeRedeemLinkAmbiguous",
    message: `Expected 1 open basin_redeem_request for tokenRedeemer, found ${open.length}`,
    basinAddress,
  });
}

/**
 * Sets `linkedRedeemOrderIndex` on hub `ApproveRedeems` for the TokenRedeemer account (issue point 3).
 *
 * @param context - Ponder context
 * @param event - `ApproveRedeems` event
 * @param cfg - Loaded basin config
 * @param params - Share class, payout asset, account, and epoch index for the new `redeem_order`
 */
export async function linkBasinRedeemOrderToEpoch(
  context: Context,
  event: TxEvent,
  cfg: BasinConfig,
  params: {
    tokenId: `0x${string}`;
    assetId: bigint;
    account: `0x${string}`;
    epochIndex: number;
  }
): Promise<void> {
  if (formatBytes32ToAddress(params.account) !== formatBytes32ToAddress(cfg.tokenRedeemer)) return;

  const basinAddress = formatBytes32ToAddress(cfg.basinAddress);
  const redeemer = formatBytes32ToAddress(cfg.tokenRedeemer);

  const open = (await BasinRedeemRequestService.query(context, {
    basinAddress,
    state: "INITIATED",
    redeemer,
    tokenId: params.tokenId,
    assetId: params.assetId,
    linkedRedeemOrderIndex: null,
  })) as BasinRedeemRequestService[];

  if (open.length === 1) {
    const batch = open[0]!;
    batch.linkRedeemOrderIndex(params.epochIndex);
    await batch.save(event);
    serviceLog(
      `Basin: linked redeem order index ${params.epochIndex} for request ${batch.read().requestId}`
    );
    return;
  }

  await insertBasinReconciliationWarning(context, event, {
    type: "redeemOrderLinkAmbiguous",
    message: `Expected 1 open basin_redeem_request for ApproveRedeems, found ${open.length}`,
    basinAddress,
  });
}

/**
 * Priority-fee delta in basis points between instant swap NAV and batch closing NAV (issue leg 3).
 *
 * @param swapAmountIn - JTRSY in for the linked swap
 * @param swapAmountOut - USDC out at swap time
 * @param batchCreditTokenAmount - Batch `creditTokenAmount` on `RedeemInitiated`
 * @param collateralTokenReturned - USDC returned on `RedeemCompleted`
 * @returns Bps delta, or `null` when division is undefined
 */
export function computePriorityFeeDeltaBps(
  swapAmountIn: bigint,
  swapAmountOut: bigint,
  batchCreditTokenAmount: bigint,
  collateralTokenReturned: bigint
): number | null {
  const instantNavValue = swapAmountOut;
  if (instantNavValue === 0n || batchCreditTokenAmount === 0n) return null;

  const closingNavValue = (swapAmountIn * collateralTokenReturned) / batchCreditTokenAmount;
  const delta = instantNavValue - closingNavValue;
  return Number((delta * 10_000n) / instantNavValue);
}
