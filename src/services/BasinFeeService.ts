import type { Context, Event } from "ponder:registry";
import { BasinFee, BasinFeeChange, BasinSwap } from "ponder:schema";
import { GrooveBasinAbi } from "../../abis/GrooveBasin";
import type { BasinConfig } from "../config/basin";
import { getSwapQuote } from "../helpers/basinQuote";
import { serviceError, serviceLog } from "../helpers/logger";
import { readContractSafe } from "../helpers/readContractSafe";
import { BasinFeeChangeService } from "./BasinFeeChangeService";
import { Service } from "./Service";

type TxEvent = Extract<Event, { transaction: { hash: `0x${string}` }; log: { logIndex: number } }>;

type FeeType = (typeof BasinFeeChange.$inferSelect)["feeType"];

/** Which basin leg a swap fee was collected in (fees are charged on the `assetOut` side). */
export type BasinFeeToken = "CREDIT" | "COLLATERAL" | "SWAP";

/** Swap direction that carries a fee (every emitted `Swap` involves the credit token). */
export type FeeableSwapDirection = Exclude<(typeof BasinSwap.$inferSelect)["direction"], "OTHER">;

/**
 * Service for `basin_fee`: the current GroveBasin swap fee state per basin — purchase and
 * redemption fee rates (bps), their admin bounds, and the cumulative fees collected per fee
 * token. Rates are maintained from `PurchaseFeeSet` / `RedemptionFeeSet` / `FeeBoundsSet`
 * and seeded from the contract views on first touch; cumulative totals aggregate
 * `basin_swap.fee` so the "fees collected" KPI is a single-row read.
 *
 * @extends {Service<typeof BasinFee>}
 */
export class BasinFeeService extends Service<typeof BasinFee> {
  static readonly entityTable = BasinFee;
  static readonly entityName = "BasinFee";

  /**
   * The basin leg a swap fee is denominated in: fees are charged on the `assetOut` side.
   *
   * @param direction - Swap direction (never `OTHER`)
   * @returns Fee token leg
   */
  static feeTokenForDirection(direction: FeeableSwapDirection): BasinFeeToken {
    if (direction === "CREDIT_TO_COLLATERAL") return "COLLATERAL";
    if (direction === "CREDIT_TO_SWAP") return "SWAP";
    return "CREDIT";
  }

  /**
   * Derives the fee charged on a swap: the event's `amountOut` is net of the fee charged
   * on the `assetOut` side, so the fee is the gross oracle quote minus `amountOut`. The
   * rate applied is the purchase fee when the credit token is bought, the redemption fee
   * otherwise. Returns a `null` fee when the quote fails or is below the net amount (the
   * swap row is still indexed; the fee is just unknown).
   *
   * @param context - Ponder context
   * @param event - `Swap` log
   * @param cfg - Loaded basin config
   * @param params - Swap direction, normalized asset pair, and event amounts
   * @returns Fee in `assetOut` token units (or `null`) and the applied rate (bps)
   */
  async computeSwapFee(
    context: Context,
    event: TxEvent,
    cfg: BasinConfig,
    params: {
      direction: FeeableSwapDirection;
      assetIn: `0x${string}`;
      assetOut: `0x${string}`;
      amountIn: bigint;
      amountOut: bigint;
    }
  ): Promise<{ fee: bigint | null; feeBps: bigint }> {
    const { direction, assetIn, assetOut, amountIn, amountOut } = params;
    const feeBps =
      direction === "COLLATERAL_TO_CREDIT" || direction === "SWAP_TO_CREDIT"
        ? this.data.purchaseFeeBps
        : this.data.redemptionFeeBps;

    const grossOut = await getSwapQuote(context, event, cfg, assetIn, assetOut, amountIn, false);
    if (grossOut === undefined) {
      serviceError(
        `GroveBasin swap quote eth_call failed. Cannot compute swap fee at block ${event.block.number}`
      );
      return { fee: null, feeBps };
    }
    if (grossOut < amountOut) {
      serviceError(
        `GroveBasin gross quote ${grossOut} below net amountOut ${amountOut} at block ` +
          `${event.block.number}; storing null fee`
      );
      return { fee: null, feeBps };
    }
    return { fee: grossOut - amountOut, feeBps };
  }

  /**
   * Loads the fee state row for the configured basin, initializing it on first touch with
   * the `purchaseFee()` / `redemptionFee()` / `minFee()` / `maxFee()` views read at the
   * event block.
   *
   * @param context - Ponder context
   * @param event - Triggering log (initialization anchor)
   * @param cfg - Loaded basin config
   * @returns Fee state service instance
   */
  static async load(context: Context, event: TxEvent, cfg: BasinConfig): Promise<BasinFeeService> {
    const key = {
      chainId: cfg.chainId,
      basinAddress: cfg.basinAddress,
      tokenId: cfg.tokenId,
    } as const;

    const existing = (await BasinFeeService.get(context, key)) as BasinFeeService | null;
    if (existing) return existing;

    const read = (functionName: "purchaseFee" | "redemptionFee" | "minFee" | "maxFee") =>
      readContractSafe(context, event, {
        abi: GrooveBasinAbi,
        address: cfg.basinAddress,
        functionName,
      });
    const [purchaseFeeBps, redemptionFeeBps, minFeeBps, maxFeeBps] = await Promise.all([
      read("purchaseFee"),
      read("redemptionFee"),
      read("minFee"),
      read("maxFee"),
    ]);
    // Fail loudly: seeding a wrong rate would silently mislabel every subsequent swap fee.
    if (
      purchaseFeeBps === undefined ||
      redemptionFeeBps === undefined ||
      minFeeBps === undefined ||
      maxFeeBps === undefined
    ) {
      throw new Error(`BasinFee: fee view read failed at block ${event.block.number}`);
    }

    serviceLog(
      `BasinFee init basin=${cfg.basinAddress} purchaseFeeBps=${purchaseFeeBps} ` +
        `redemptionFeeBps=${redemptionFeeBps} bounds=[${minFeeBps},${maxFeeBps}]`
    );

    const created = (await BasinFeeService.insert(
      context,
      {
        ...key,
        poolId: cfg.poolId,
        purchaseFeeBps,
        redemptionFeeBps,
        minFeeBps,
        maxFeeBps,
        feesCollectedCredit: 0n,
        feesCollectedCollateral: 0n,
        feesCollectedSwap: 0n,
        lastUpdatedAt: new Date(Number(event.block.timestamp) * 1000),
        lastUpdatedAtBlock: Number(event.block.number),
      },
      event
    )) as BasinFeeService | null;
    if (!created) throw new Error(`Failed to initialize BasinFee for ${cfg.basinAddress}`);
    return created;
  }

  /**
   * Applies a fee rate change from `PurchaseFeeSet` / `RedemptionFeeSet`: updates the
   * current rate, persists the row, and appends the immutable `basin_fee_change` ledger
   * entry (with the event's old rate for on-chain fidelity).
   *
   * @param context - Ponder context
   * @param event - Rate-setting log (ledger PK = chainId + txHash + logIndex)
   * @param params - Fee type plus old and new rates (bps) from the event args
   * @returns The created ledger entry service
   */
  async applyRateChange(
    context: Context,
    event: TxEvent,
    params: { feeType: FeeType; oldFeeBps: bigint; newFeeBps: bigint }
  ): Promise<BasinFeeChangeService | null> {
    if (params.feeType === "PURCHASE") {
      this.data.purchaseFeeBps = params.newFeeBps;
    } else {
      this.data.redemptionFeeBps = params.newFeeBps;
    }
    this.touch(event);

    serviceLog(
      `BasinFee applyRateChange basin=${this.data.basinAddress} type=${params.feeType} ` +
        `${params.oldFeeBps} -> ${params.newFeeBps}`
    );
    await this.save(event);

    return (await BasinFeeChangeService.insert(
      context,
      {
        chainId: this.data.chainId,
        txHash: event.transaction.hash,
        logIndex: event.log.logIndex,
        basinAddress: this.data.basinAddress,
        tokenId: this.data.tokenId,
        feeType: params.feeType,
        oldFeeBps: params.oldFeeBps,
        newFeeBps: params.newFeeBps,
        blockNumber: Number(event.block.number),
        timestamp: new Date(Number(event.block.timestamp) * 1000),
      },
      event
    )) as BasinFeeChangeService | null;
  }

  /**
   * Applies new admin fee bounds from `FeeBoundsSet` and persists the row. Bounds only
   * constrain future rate settings, so no ledger entry is written.
   *
   * @param event - Bounds-setting log
   * @param params - New minimum and maximum fee rates (bps)
   */
  async applyFeeBounds(
    event: TxEvent,
    params: { minFeeBps: bigint; maxFeeBps: bigint }
  ): Promise<void> {
    this.data.minFeeBps = params.minFeeBps;
    this.data.maxFeeBps = params.maxFeeBps;
    this.touch(event);

    serviceLog(
      `BasinFee applyFeeBounds basin=${this.data.basinAddress} ` +
        `bounds=[${params.minFeeBps},${params.maxFeeBps}]`
    );
    await this.save(event);
  }

  /**
   * Adds a collected swap fee to the cumulative counter of the fee token and persists
   * the row.
   *
   * @param event - Swap log the fee was charged in
   * @param feeToken - Basin leg the fee is denominated in (the swap's `assetOut`)
   * @param fee - Fee amount in fee token units
   */
  async addCollectedFee(event: TxEvent, feeToken: BasinFeeToken, fee: bigint): Promise<void> {
    if (feeToken === "CREDIT") {
      this.data.feesCollectedCredit += fee;
    } else if (feeToken === "COLLATERAL") {
      this.data.feesCollectedCollateral += fee;
    } else {
      this.data.feesCollectedSwap += fee;
    }
    this.touch(event);

    serviceLog(
      `BasinFee addCollectedFee basin=${this.data.basinAddress} token=${feeToken} fee=${fee}`
    );
    await this.save(event);
  }

  /**
   * Stamps the row's `lastUpdatedAt` / `lastUpdatedAtBlock` from the event block.
   *
   * @param event - Triggering log
   */
  private touch(event: TxEvent): void {
    this.data.lastUpdatedAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.lastUpdatedAtBlock = Number(event.block.number);
  }
}
