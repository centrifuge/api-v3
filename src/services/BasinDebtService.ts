import type { Context, Event } from "ponder:registry";
import { BasinDebt, BasinDebtChange } from "ponder:schema";
import { SUSDSAbi } from "../../abis/SUSDS";
import type { BasinConfig } from "../config/basin";
import {
  DEBT_SPREAD_BPS,
  FALLBACK_SSR_PER_SECOND_RAY,
  SPREAD_PER_SECOND_RAY,
  getSusdsAddress,
} from "../config/sky";
import { RAY, rpow } from "../helpers/bigintMath";
import { formatBytes32ToAddress } from "../helpers/formatter";
import { serviceLog } from "../helpers/logger";
import { readContractSafe } from "../helpers/readContractSafe";
import { BasinDebtChangeService } from "./BasinDebtChangeService";
import { Service } from "./Service";

type TxEvent = Extract<Event, { transaction: { hash: `0x${string}` }; log: { logIndex: number } }>;

/** ERC20 Transfer log shape (credit token balance tracking). */
type TokenTransferEvent = TxEvent & {
  args: { from: `0x${string}`; to: `0x${string}`; value: bigint };
};

type DebtChangeType = (typeof BasinDebtChange.$inferSelect)["type"];

/**
 * Service for `basin_debt`: the running CFGL-owes-Grove position per basin. Debt is
 * created by swap payouts, reduced by repayments, and compounds per second at
 * SSR + {@link DEBT_SPREAD_BPS} bps between debt-affecting events. All amounts are
 * normalized to 18 decimals.
 *
 * @extends {Service<typeof BasinDebt>}
 */
export class BasinDebtService extends Service<typeof BasinDebt> {
  static readonly entityTable = BasinDebt;
  static readonly entityName = "BasinDebt";

  /**
   * Effective per-second compounding factor: SSR and the fixed spread multiply as
   * per-second factors.
   *
   * @param ssrPerSecondRay - Raw sUSDS `ssr` (Ray)
   * @returns Effective per-second rate (Ray)
   */
  static effectiveRatePerSecondRay(ssrPerSecondRay: bigint): bigint {
    return (ssrPerSecondRay * SPREAD_PER_SECOND_RAY) / RAY;
  }

  /**
   * Projects a debt balance forward to `nowSeconds` under the single accrual rule:
   * interest compounds per second while the debt is positive; a negative balance
   * (over-repayment) stays constant. Used by both event-time accrual and the live
   * `/stats/basin-debt` projection.
   *
   * @param data - Debt state (balance, effective rate, last accrual time)
   * @param nowSeconds - Unix timestamp to project to
   * @returns Projected debt (18 decimals)
   */
  static projectDebt(
    data: { debt: bigint; ratePerSecondRay: bigint; lastUpdatedAt: Date },
    nowSeconds: bigint
  ): bigint {
    const lastSeconds = BigInt(Math.floor(data.lastUpdatedAt.getTime() / 1000));
    const elapsed = nowSeconds > lastSeconds ? nowSeconds - lastSeconds : 0n;
    if (elapsed === 0n || data.debt <= 0n) return data.debt;
    return (data.debt * rpow(data.ratePerSecondRay, elapsed)) / RAY;
  }

  /**
   * Loads the debt row for the configured basin, initializing it on first touch with the
   * SSR read from sUSDS at the event block (or the testnet fallback rate when the chain
   * has no sUSDS).
   *
   * @param context - Ponder context
   * @param event - Triggering log (initialization anchor)
   * @param cfg - Loaded basin config
   * @returns Debt service instance
   */
  static async load(context: Context, event: TxEvent, cfg: BasinConfig): Promise<BasinDebtService> {
    const key = {
      chainId: cfg.chainId,
      basinAddress: cfg.basinAddress,
      tokenId: cfg.tokenId,
    } as const;

    const existing = (await BasinDebtService.get(context, key)) as BasinDebtService | null;
    if (existing) return existing;

    const susdsAddress = getSusdsAddress(cfg.chainId);
    const ssrPerSecondRay = susdsAddress
      ? await readContractSafe(context, event, {
          abi: SUSDSAbi,
          address: susdsAddress,
          functionName: "ssr",
        })
      : FALLBACK_SSR_PER_SECOND_RAY;
    // Fail loudly: seeding a wrong rate would silently corrupt all subsequent accrual.
    if (ssrPerSecondRay === undefined) {
      throw new Error(`BasinDebt: sUSDS ssr read failed at block ${event.block.number}`);
    }

    serviceLog(
      `BasinDebt init basin=${cfg.basinAddress} ssr=${ssrPerSecondRay} ` +
        `susds=${susdsAddress ?? "fallback"}`
    );

    const created = (await BasinDebtService.insert(
      context,
      {
        ...key,
        poolId: cfg.poolId,
        debt: 0n,
        ssrPerSecondRay,
        ratePerSecondRay: BasinDebtService.effectiveRatePerSecondRay(ssrPerSecondRay),
        spreadBps: DEBT_SPREAD_BPS,
        creditTokenBalance: 0n,
        pendingCreditTokenAmount: 0n,
        lastUpdatedAt: new Date(Number(event.block.timestamp) * 1000),
        lastUpdatedAtBlock: Number(event.block.number),
      },
      event
    )) as BasinDebtService | null;
    if (!created) throw new Error(`Failed to initialize BasinDebt for ${cfg.basinAddress}`);
    return created;
  }

  /**
   * Accrues interest since `lastUpdatedAt`, applies a principal delta, persists the row,
   * and appends the immutable `basin_debt_change` ledger entry.
   *
   * Interest only compounds while the debt is positive; a negative balance (over-repayment)
   * stays constant until drawn down again.
   *
   * @param context - Ponder context
   * @param event - Debt-affecting log (ledger PK = chainId + txHash + logIndex)
   * @param params - Change type, signed 18-decimal principal delta, optional new SSR (Ray)
   * @returns The created ledger entry service
   */
  async accrueAndApply(
    context: Context,
    event: TxEvent,
    params: { type: DebtChangeType; principalDelta: bigint; newSsrPerSecondRay?: bigint }
  ): Promise<BasinDebtChangeService | null> {
    const nowSeconds = event.block.timestamp;
    const interestAccrued = BasinDebtService.projectDebt(this.data, nowSeconds) - this.data.debt;

    this.data.debt = this.data.debt + interestAccrued + params.principalDelta;
    if (params.newSsrPerSecondRay !== undefined) {
      this.data.ssrPerSecondRay = params.newSsrPerSecondRay;
      this.data.ratePerSecondRay = BasinDebtService.effectiveRatePerSecondRay(
        params.newSsrPerSecondRay
      );
    }
    this.data.lastUpdatedAt = new Date(Number(nowSeconds) * 1000);
    this.data.lastUpdatedAtBlock = Number(event.block.number);

    serviceLog(
      `BasinDebt accrueAndApply basin=${this.data.basinAddress} type=${params.type} ` +
        `interest=${interestAccrued} principalDelta=${params.principalDelta} debt=${this.data.debt}`
    );
    await this.save(event);

    return (await BasinDebtChangeService.insert(
      context,
      {
        chainId: this.data.chainId,
        txHash: event.transaction.hash,
        logIndex: event.log.logIndex,
        basinAddress: this.data.basinAddress,
        tokenId: this.data.tokenId,
        type: params.type,
        interestAccrued,
        principalDelta: params.principalDelta,
        debtAfter: this.data.debt,
        ratePerSecondRay: this.data.ratePerSecondRay,
        blockNumber: Number(event.block.number),
        timestamp: new Date(Number(nowSeconds) * 1000),
      },
      event
    )) as BasinDebtChangeService | null;
  }

  /**
   * Claims a same-transaction `TRANSFER_REPAYMENT` ledger entry produced by the raw
   * stablecoin Transfer log and re-labels it, avoiding a double-counted repayment.
   *
   * The GroveBasin contracts guarantee the match: buy-side swaps `transferFrom` exactly
   * `amountIn` and the token redeemer transfers exactly `collateralTokenReturned`, in both
   * cases before the basin event is emitted (lower logIndex). The raw transfer is therefore
   * the source of truth for the debt effect; when no entry matches the caller must NOT
   * apply the repayment again but surface a `repaymentClaimMissing` warning.
   *
   * @param context - Ponder context
   * @param event - Basin event in the same transaction
   * @param params - Expected signed principal delta and the type to claim it as
   * @returns `true` when an entry was claimed
   */
  async claimTransferRepayment(
    context: Context,
    event: TxEvent,
    params: { principalDelta: bigint; claimAs: DebtChangeType }
  ): Promise<boolean> {
    // Only Transfer logs preceding this basin event qualify; take the nearest one so a tx
    // with several equal-value transfers claims deterministically.
    const candidates = (await BasinDebtChangeService.query(context, {
      chainId: this.data.chainId,
      txHash: event.transaction.hash,
      basinAddress: this.data.basinAddress,
      type: "TRANSFER_REPAYMENT",
      principalDelta: params.principalDelta,
      logIndex_lt: event.log.logIndex,
      _sort: [{ field: "logIndex", direction: "desc" }],
    })) as BasinDebtChangeService[];

    const claimed = candidates[0];
    if (!claimed) return false;
    claimed.relabel(params.claimAs);
    await claimed.save(null);
    return true;
  }

  /**
   * Applies a credit token (JTRSY) Transfer touching the basin to its live balance: inbound
   * transfers increase it, outbound decrease it. No debt effect — the balance is the cap for
   * how much a new redemption can be requested for. Transfers not involving the basin no-op.
   *
   * @param context - Ponder context
   * @param event - Credit token `Transfer` log
   * @param cfg - Loaded basin config
   */
  static async applyCreditTokenTransfer(
    context: Context,
    event: TokenTransferEvent,
    cfg: BasinConfig
  ): Promise<void> {
    const basinAddress = formatBytes32ToAddress(cfg.basinAddress);
    const from = formatBytes32ToAddress(event.args.from);
    const to = formatBytes32ToAddress(event.args.to);
    if (from === to || (from !== basinAddress && to !== basinAddress)) return;

    const debt = await BasinDebtService.load(context, event, cfg);
    debt.adjustCreditTokenBalance(to === basinAddress ? event.args.value : -event.args.value);
    await debt.save(event);
  }

  /**
   * Adjusts the basin's live credit token balance (no debt effect; caller saves).
   *
   * @param delta - Signed credit token amount (token decimals)
   */
  adjustCreditTokenBalance(delta: bigint): void {
    serviceLog(`BasinDebt adjustCreditTokenBalance basin=${this.data.basinAddress} delta=${delta}`);
    this.data.creditTokenBalance += delta;
  }

  /**
   * Adjusts the credit tokens pending in initiated redemptions (no debt effect; caller saves).
   *
   * @param delta - Signed credit token amount (token decimals)
   */
  adjustPendingCreditTokenAmount(delta: bigint): void {
    serviceLog(
      `BasinDebt adjustPendingCreditTokenAmount basin=${this.data.basinAddress} delta=${delta}`
    );
    this.data.pendingCreditTokenAmount += delta;
  }
}
