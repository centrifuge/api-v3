import { ponder } from "ponder:registry";
import { isGroveBasinIndexingConfigured, loadBasinConfig } from "../config/basin";
import { scaleDecimals } from "../helpers/bigintMath";
import { formatBytes32ToAddress } from "../helpers/formatter";
import { computeRedeemRequestId, getSwapQuote, swapDirection } from "../helpers/basinQuote";
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
} from "../services";

if (isGroveBasinIndexingConfigured) {
  ponder.on("groveBasin:Swap", async ({ event, context }) => {
    const cfg = loadBasinConfig(context);
    if (!cfg) return;

    logEvent(event, context, "groveBasin:Swap");
    const { assetIn, assetOut, sender, receiver, amountIn, amountOut } = event.args;
    const basinAddress = formatBytes32ToAddress(event.log.address);
    const direction = swapDirection(assetIn, assetOut, cfg);

    // Fee and debt state are only needed for credit-leg swaps; OTHER swaps skip the loads
    // (several eth_calls on first touch). The fee derivation itself lives in BasinFeeService.
    let fee: bigint | null = null;
    let feeBps: bigint | null = null;
    let feeState: BasinFeeService | null = null;
    let debt: BasinDebtService | null = null;
    if (direction !== "OTHER") {
      [feeState, debt] = await Promise.all([
        BasinFeeService.load(context, event, cfg),
        BasinDebtService.load(context, event, cfg),
      ]);
      ({ fee, feeBps } = await feeState.computeSwapFee(context, event, cfg, {
        direction,
        assetIn: formatBytes32ToAddress(assetIn),
        assetOut: formatBytes32ToAddress(assetOut),
        amountIn,
        amountOut,
      }));
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
      await feeState.addCollectedFee(event, BasinFeeService.feeTokenForDirection(direction), fee);
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
      // The buy-side inflow is a single `_pullAsset` transferFrom of exactly amountIn that the
      // contract executes before emitting Swap, so the TRANSFER_REPAYMENT ledger entry must
      // exist. The raw transfer is the source of truth for the debt effect; a missing claim is
      // an anomaly to surface, never a reason to apply a second reduction.
      const decimals =
        direction === "COLLATERAL_TO_CREDIT" ? cfg.collateralTokenDecimals : cfg.swapTokenDecimals;
      const principalDelta = -scaleDecimals(amountIn, decimals);
      const claimed = await debt.claimTransferRepayment(context, event, {
        principalDelta,
        claimAs: "SWAP_REPAYMENT",
      });
      if (!claimed) {
        serviceError(
          `GroveBasin buy-side swap found no TRANSFER_REPAYMENT to claim ` +
            `(tx ${event.transaction.hash}, principalDelta ${principalDelta})`
        );
        await insertBasinReconciliationWarning(context, event, {
          type: "repaymentClaimMissing",
          message: `Buy-side swap found no same-tx TRANSFER_REPAYMENT for ${principalDelta}`,
          basinAddress,
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

    // The redeemer contract allows a single in-flight redemption and completions are always
    // full, so this event closes every open request for the redeemer: the newest one is the
    // request completed on-chain; any older row means its completion event was missed and it
    // is closed as stale (null collateral) so it cannot poison future matching.
    if (open.length !== 1) {
      await insertBasinReconciliationWarning(context, event, {
        type: "completeOrphan",
        message: `Expected 1 INITIATED basin_redeem_request, found ${open.length}`,
        basinAddress,
      });
    }

    const newestFirst = [...open].sort(
      (a, b) => b.read().initiatedAtBlock - a.read().initiatedAtBlock
    );
    let pendingCleared = 0n;
    for (const [index, request] of newestFirst.entries()) {
      pendingCleared += request.read().creditTokenAmount;
      request.complete(index === 0 ? collateralTokenReturned : null, event);
      await request.save(event);
    }

    // Repayment: the redeemer transfers exactly `collateralTokenReturned` USDC to the basin
    // in this tx before the event is emitted, recorded as TRANSFER_REPAYMENT by the raw
    // Transfer log; claim it as REDEMPTION. The raw transfer is the source of truth for the
    // debt effect; a missing claim is an anomaly to surface, never a second reduction.
    const debt = await BasinDebtService.load(context, event, cfg);
    if (pendingCleared > 0n) debt.adjustPendingCreditTokenAmount(-pendingCleared);

    const principalDelta = -scaleDecimals(collateralTokenReturned, cfg.collateralTokenDecimals);
    const claimed = await debt.claimTransferRepayment(context, event, {
      principalDelta,
      claimAs: "REDEMPTION",
    });
    if (!claimed) {
      serviceError(
        `GroveBasin RedeemCompleted found no TRANSFER_REPAYMENT to claim ` +
          `(tx ${event.transaction.hash}, principalDelta ${principalDelta})`
      );
      await insertBasinReconciliationWarning(context, event, {
        type: "repaymentClaimMissing",
        message: `RedeemCompleted found no same-tx TRANSFER_REPAYMENT for ${principalDelta}`,
        basinAddress,
      });
    }
    await debt.save(event);
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
