import { ponder } from "ponder:registry";
import type { BasinConfig } from "../config/basin";
import { isGroveBasinIndexingConfigured, loadBasinConfig } from "../config/basin";
import { formatBytes32ToAddress } from "../helpers/formatter";
import { computeRedeemRequestId, getSwapQuote } from "../helpers/basinQuote";
import {
  computePriorityFeeDeltaBps,
  insertBasinReconciliationWarning,
  linkSpokeRedeemIfPending,
} from "../helpers/basinReconciliation";
import { logEvent } from "../helpers/logger";
import { timestamper } from "../helpers/timestamper";
import { BasinRedeemRequestService, BasinSwapService } from "../services";

/**
 * Maps GroveBasin `Swap` asset pair to `basin_swap_direction` enum value.
 *
 * @param assetIn - Token sold
 * @param assetOut - Token bought
 * @param cfg - Basin config for token addresses
 */
function swapDirection(
  assetIn: `0x${string}`,
  assetOut: `0x${string}`,
  cfg: BasinConfig
): "CREDIT_TO_COLLATERAL" | "CREDIT_TO_SWAP" | "COLLATERAL_TO_CREDIT" | "SWAP_TO_CREDIT" | "OTHER" {
  const credit = formatBytes32ToAddress(cfg.creditToken);
  const collateral = formatBytes32ToAddress(cfg.collateralToken);
  const swap = formatBytes32ToAddress(cfg.swapToken);
  const inAddr = formatBytes32ToAddress(assetIn);
  const outAddr = formatBytes32ToAddress(assetOut);

  if (inAddr === credit && outAddr === collateral) return "CREDIT_TO_COLLATERAL";
  if (inAddr === credit && outAddr === swap) return "CREDIT_TO_SWAP";
  if (inAddr === collateral && outAddr === credit) return "COLLATERAL_TO_CREDIT";
  if (inAddr === swap && outAddr === credit) return "SWAP_TO_CREDIT";
  return "OTHER";
}

if (isGroveBasinIndexingConfigured) {
  ponder.on("groveBasin:Swap", async ({ event, context }) => {
    const cfg = loadBasinConfig(context);
    if (!cfg) return;

    logEvent(event, context, "groveBasin:Swap");
    const { assetIn, assetOut, sender, receiver, amountIn, amountOut } = event.args;
    const basinAddress = formatBytes32ToAddress(event.log.address);

    await BasinSwapService.insert(
      context,
      {
        chainId: context.chain!.id,
        txHash: event.transaction.hash,
        logIndex: event.log.logIndex,
        basinAddress,
        poolId: cfg.poolId,
        tokenId: cfg.tokenId,
        direction: swapDirection(assetIn, assetOut, cfg),
        assetIn: formatBytes32ToAddress(assetIn),
        assetOut: formatBytes32ToAddress(assetOut),
        amountIn,
        amountOut,
        sender: formatBytes32ToAddress(sender),
        receiver: formatBytes32ToAddress(receiver),
        basinRedeemRequestId: null,
        priorityFeeDeltaBps: null,
        blockNumber: Number(event.block.number),
        timestamp: new Date(Number(event.block.timestamp) * 1000),
      },
      event
    );
  });

  ponder.on("groveBasin:RedeemInitiated", async ({ event, context }) => {
    const cfg = loadBasinConfig(context);
    if (!cfg) return;

    logEvent(event, context, "groveBasin:RedeemInitiated");
    const { redeemer, amount: creditTokenAmount } = event.args;
    const basinAddress = formatBytes32ToAddress(event.log.address);
    const redeemerNorm = formatBytes32ToAddress(redeemer);

    const collateralTokenAmountQuoted = await getSwapQuote(
      context,
      event,
      cfg,
      formatBytes32ToAddress(cfg.creditToken),
      formatBytes32ToAddress(cfg.collateralToken),
      creditTokenAmount,
      false
    );

    const requestId = computeRedeemRequestId({
      blockNumber: event.block.number,
      redeemer: redeemerNorm,
      creditTokenAmount,
      collateralTokenAmount: collateralTokenAmountQuoted,
    });

    await BasinRedeemRequestService.insert(
      context,
      {
        basinAddress,
        requestId,
        centrifugeId: cfg.centrifugeId,
        poolId: cfg.poolId,
        tokenId: cfg.tokenId,
        assetId: cfg.assetId,
        redeemer: redeemerNorm,
        creditTokenAmount,
        collateralTokenAmountQuoted,
        state: "INITIATED",
        ...timestamper("initiated", event),
        ...timestamper("completed", null),
        ...timestamper("spokeRedeemRequested", null),
        collateralTokenReturned: null,
        linkedRedeemOrderIndex: null,
      },
      event
    );

    const swaps = (await BasinSwapService.query(context, {
      basinAddress,
      direction: "CREDIT_TO_COLLATERAL",
      basinRedeemRequestId: null,
      blockNumber_lte: Number(event.block.number),
    })) as BasinSwapService[];

    const sumIn = swaps.reduce((acc, s) => acc + s.read().amountIn, 0n);

    if (swaps.length === 0) {
      await insertBasinReconciliationWarning(context, event, {
        type: "initiateNoSwaps",
        message: "RedeemInitiated with no unbatched CREDIT_TO_COLLATERAL swaps",
        basinAddress,
        basinRedeemRequestId: requestId,
      });
    } else if (sumIn !== creditTokenAmount) {
      await insertBasinReconciliationWarning(context, event, {
        type: "batchSumMismatch",
        message: `SUM(swap.amountIn)=${sumIn} !== creditTokenAmount=${creditTokenAmount}`,
        basinAddress,
        basinRedeemRequestId: requestId,
      });
    }

    for (const swap of swaps) {
      swap.linkToRedeemRequest(requestId);
    }
    if (swaps.length === 1) {
      await swaps[0]!.save(event);
    } else if (swaps.length > 1) {
      await BasinSwapService.saveMany(context, swaps, event);
    }

    await linkSpokeRedeemIfPending(context, event, cfg);
  });

  ponder.on("groveBasin:RedeemCompleted", async ({ event, context }) => {
    const cfg = loadBasinConfig(context);
    if (!cfg) return;

    logEvent(event, context, "groveBasin:RedeemCompleted");
    const { redeemer, amount: collateralTokenReturned } = event.args;
    const basinAddress = formatBytes32ToAddress(event.log.address);
    const redeemerNorm = formatBytes32ToAddress(redeemer);

    const open = (await BasinRedeemRequestService.query(context, {
      basinAddress,
      state: "INITIATED",
      redeemer: redeemerNorm,
    })) as BasinRedeemRequestService[];

    if (open.length !== 1) {
      await insertBasinReconciliationWarning(context, event, {
        type: "completeOrphan",
        message: `Expected 1 INITIATED basin_redeem_request, found ${open.length}`,
        basinAddress,
      });
      return;
    }

    const batch = open[0]!;
    const { requestId, creditTokenAmount } = batch.read();

    batch.complete(collateralTokenReturned, event);
    await batch.save(event);

    const swaps = (await BasinSwapService.query(context, {
      basinAddress,
      basinRedeemRequestId: requestId,
    })) as BasinSwapService[];

    for (const swap of swaps) {
      const { amountIn, amountOut } = swap.read();
      swap.setPriorityFeeDeltaBps(
        computePriorityFeeDeltaBps(amountIn, amountOut, creditTokenAmount, collateralTokenReturned)
      );
    }

    if (swaps.length === 1) {
      await swaps[0]!.save(event);
    } else if (swaps.length > 1) {
      await BasinSwapService.saveMany(context, swaps, event);
    }
  });
}
