import { ponder } from "ponder:registry";
import type { BasinConfig } from "../config/basin";
import { isGroveBasinIndexingConfigured, loadBasinConfig } from "../config/basin";
import { scaleDecimals } from "../helpers/bigintMath";
import { formatBytes32ToAddress } from "../helpers/formatter";
import { computeRedeemRequestId, getSwapQuote } from "../helpers/basinQuote";
import {
  insertBasinReconciliationWarning,
  linkSpokeRedeemIfPending,
} from "../helpers/basinReconciliation";
import { logEvent, serviceError } from "../helpers/logger";
import { timestamper } from "../helpers/timestamper";
import {
  BasinDebtService,
  BasinFeeService,
  BasinRedeemRequestService,
  BasinSwapService,
  type BasinFeeToken,
} from "../services";

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

/**
 * The basin leg a swap fee is denominated in: fees are charged on the `assetOut` side.
 *
 * @param direction - Swap direction (must not be `OTHER`)
 * @returns Fee token leg
 */
function feeTokenForDirection(
  direction: "CREDIT_TO_COLLATERAL" | "CREDIT_TO_SWAP" | "COLLATERAL_TO_CREDIT" | "SWAP_TO_CREDIT"
): BasinFeeToken {
  if (direction === "CREDIT_TO_COLLATERAL") return "COLLATERAL";
  if (direction === "CREDIT_TO_SWAP") return "SWAP";
  return "CREDIT";
}

if (isGroveBasinIndexingConfigured) {
  ponder.on("groveBasin:Swap", async ({ event, context }) => {
    const cfg = loadBasinConfig(context);
    if (!cfg) return;

    logEvent(event, context, "groveBasin:Swap");
    const { assetIn, assetOut, sender, receiver, amountIn, amountOut } = event.args;
    const basinAddress = formatBytes32ToAddress(event.log.address);
    const direction = swapDirection(assetIn, assetOut, cfg);

    // Swap fee: the event's amountOut is net of the fee charged on the assetOut side, so the
    // fee is the gross oracle quote minus amountOut. The fee rate applied is the purchase fee
    // when the credit token is bought, the redemption fee otherwise. OTHER swaps have no fee
    // or debt effect, so the state loads (several eth_calls on first touch) are skipped.
    let fee: bigint | null = null;
    let feeBps: bigint | null = null;
    let feeState: BasinFeeService | null = null;
    let debt: BasinDebtService | null = null;
    if (direction !== "OTHER") {
      let grossOut: bigint | undefined;
      [feeState, debt, grossOut] = await Promise.all([
        BasinFeeService.load(context, event, cfg),
        BasinDebtService.load(context, event, cfg),
        getSwapQuote(
          context,
          event,
          cfg,
          formatBytes32ToAddress(assetIn),
          formatBytes32ToAddress(assetOut),
          amountIn,
          false
        ),
      ]);
      feeBps =
        direction === "COLLATERAL_TO_CREDIT" || direction === "SWAP_TO_CREDIT"
          ? feeState.read().purchaseFeeBps
          : feeState.read().redemptionFeeBps;
      if (grossOut === undefined) {
        serviceError(
          `GroveBasin swap quote eth_call failed. Cannot compute swap fee at block ${event.block.number}`
        );
      } else if (grossOut < amountOut) {
        serviceError(
          `GroveBasin gross quote ${grossOut} below net amountOut ${amountOut} at block ` +
            `${event.block.number}; storing null fee`
        );
      } else {
        fee = grossOut - amountOut;
      }
    }

    await BasinSwapService.insert(
      context,
      {
        chainId: context.chain!.id,
        txHash: event.transaction.hash,
        logIndex: event.log.logIndex,
        basinAddress,
        poolId: cfg.poolId,
        tokenId: cfg.tokenId,
        direction,
        assetIn: formatBytes32ToAddress(assetIn),
        assetOut: formatBytes32ToAddress(assetOut),
        amountIn,
        amountOut,
        fee,
        feeBps,
        sender: formatBytes32ToAddress(sender),
        receiver: formatBytes32ToAddress(receiver),
        blockNumber: Number(event.block.number),
        timestamp: new Date(Number(event.block.timestamp) * 1000),
      },
      event
    );

    if (direction !== "OTHER" && feeState && fee !== null && fee > 0n) {
      await feeState.addCollectedFee(event, feeTokenForDirection(direction), fee);
    }

    // Debt effects (all 18-decimal normalized): sell-side swaps are CFGL drawdowns for the
    // net stablecoin paid out; buy-side swaps are repayments for the stablecoin received.
    // The buy-side inflow was already recorded by the raw Transfer log earlier in this tx
    // (lower logIndex), so claim that ledger entry instead of double-applying.
    if (!debt) return;

    if (direction === "CREDIT_TO_COLLATERAL" || direction === "CREDIT_TO_SWAP") {
      const decimals =
        direction === "CREDIT_TO_COLLATERAL" ? cfg.collateralTokenDecimals : cfg.swapTokenDecimals;
      await debt.accrueAndApply(context, event, {
        type: "SWAP_PAYOUT",
        principalDelta: scaleDecimals(amountOut, decimals),
      });
    } else if (direction === "COLLATERAL_TO_CREDIT" || direction === "SWAP_TO_CREDIT") {
      const decimals =
        direction === "COLLATERAL_TO_CREDIT" ? cfg.collateralTokenDecimals : cfg.swapTokenDecimals;
      const principalDelta = -scaleDecimals(amountIn, decimals);
      const claimed = await debt.claimTransferRepayment(context, event, {
        principalDelta,
        claimAs: "SWAP_REPAYMENT",
      });
      if (!claimed) {
        await debt.accrueAndApply(context, event, {
          type: "SWAP_REPAYMENT",
          principalDelta,
        });
      }
    }
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
    if (collateralTokenAmountQuoted === undefined) {
      return serviceError(
        `GroveBasin swap quote eth_call failed. Cannot index RedeemInitiated at block ${event.block.number}`
      );
    }

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

    // No debt effect: the drawdown happened at swap time and repayment happens when the
    // redemption completes. Only the in-flight credit token amount changes here.
    const debt = await BasinDebtService.load(context, event, cfg);
    debt.adjustPendingCreditTokenAmount(creditTokenAmount);
    await debt.save(event);

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

    const batch = open.length === 1 ? open[0] : undefined;
    if (!batch) {
      await insertBasinReconciliationWarning(context, event, {
        type: "completeOrphan",
        message: `Expected 1 INITIATED basin_redeem_request, found ${open.length}`,
        basinAddress,
      });
    } else {
      batch.complete(collateralTokenReturned, event);
      await batch.save(event);
    }

    // Repayment: the vault's USDC arrived via the redeemer's Transfer earlier in this tx,
    // recorded as TRANSFER_REPAYMENT by the raw Transfer log; claim it as REDEMPTION.
    const debt = await BasinDebtService.load(context, event, cfg);
    if (batch) debt.adjustPendingCreditTokenAmount(-batch.read().creditTokenAmount);

    const principalDelta = -scaleDecimals(collateralTokenReturned, cfg.collateralTokenDecimals);
    const claimed = await debt.claimTransferRepayment(context, event, {
      principalDelta,
      claimAs: "REDEMPTION",
    });
    if (!claimed) {
      await debt.accrueAndApply(context, event, { type: "REDEMPTION", principalDelta });
    } else {
      await debt.save(event);
    }
  });

  ponder.on("basinUsdc:Transfer", async ({ event, context }) => {
    const cfg = loadBasinConfig(context);
    if (!cfg) return;

    const { from, to, value } = event.args;
    if (value === 0n) return;
    if (formatBytes32ToAddress(to) !== formatBytes32ToAddress(cfg.basinAddress)) return;

    // Internal flows are not repayments: the pocket funding a swap payout, and Grove (the
    // liquidity provider) adding its own liquidity. The token redeemer's settlement transfer
    // IS recorded here and re-labeled to REDEMPTION by the RedeemCompleted handler.
    const fromNorm = formatBytes32ToAddress(from);
    if (
      fromNorm === formatBytes32ToAddress(cfg.pocket) ||
      fromNorm === formatBytes32ToAddress(cfg.liquidityProvider)
    ) {
      return;
    }

    logEvent(event, context, "basinUsdc:Transfer");

    const debt = await BasinDebtService.load(context, event, cfg);
    await debt.accrueAndApply(context, event, {
      type: "TRANSFER_REPAYMENT",
      principalDelta: -scaleDecimals(value, cfg.collateralTokenDecimals),
    });
  });

  ponder.on("basinUsds:Transfer", async ({ event, context }) => {
    const cfg = loadBasinConfig(context);
    if (!cfg) return;

    const { from, to, value } = event.args;
    if (value === 0n) return;
    if (formatBytes32ToAddress(to) !== formatBytes32ToAddress(cfg.pocket)) return;

    // USDS reaching the pocket from third parties reduces the debt; Grove's LP deposits and
    // the basin's own custody moves do not.
    const fromNorm = formatBytes32ToAddress(from);
    if (
      fromNorm === formatBytes32ToAddress(cfg.liquidityProvider) ||
      fromNorm === formatBytes32ToAddress(cfg.basinAddress)
    ) {
      return;
    }

    logEvent(event, context, "basinUsds:Transfer");

    const debt = await BasinDebtService.load(context, event, cfg);
    await debt.accrueAndApply(context, event, {
      type: "TRANSFER_REPAYMENT",
      principalDelta: -scaleDecimals(value, cfg.swapTokenDecimals),
    });
  });

  ponder.on("groveBasin:PurchaseFeeSet", async ({ event, context }) => {
    const cfg = loadBasinConfig(context);
    if (!cfg) return;

    logEvent(event, context, "groveBasin:PurchaseFeeSet");
    const { oldPurchaseFee, newPurchaseFee } = event.args;

    const feeState = await BasinFeeService.load(context, event, cfg);
    await feeState.applyRateChange(context, event, {
      feeType: "PURCHASE",
      oldFeeBps: oldPurchaseFee,
      newFeeBps: newPurchaseFee,
    });
  });

  ponder.on("groveBasin:RedemptionFeeSet", async ({ event, context }) => {
    const cfg = loadBasinConfig(context);
    if (!cfg) return;

    logEvent(event, context, "groveBasin:RedemptionFeeSet");
    const { oldRedemptionFee, newRedemptionFee } = event.args;

    const feeState = await BasinFeeService.load(context, event, cfg);
    await feeState.applyRateChange(context, event, {
      feeType: "REDEMPTION",
      oldFeeBps: oldRedemptionFee,
      newFeeBps: newRedemptionFee,
    });
  });

  ponder.on("groveBasin:FeeBoundsSet", async ({ event, context }) => {
    const cfg = loadBasinConfig(context);
    if (!cfg) return;

    logEvent(event, context, "groveBasin:FeeBoundsSet");
    const { newMinFee, newMaxFee } = event.args;

    const feeState = await BasinFeeService.load(context, event, cfg);
    await feeState.applyFeeBounds(event, { minFeeBps: newMinFee, maxFeeBps: newMaxFee });
  });
}
