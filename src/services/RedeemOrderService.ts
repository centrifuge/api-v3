import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { RedeemOrder } from "ponder:schema";

/**
 * Service class for managing redeem orders in the system.
 *
 * This service handles redeem operations for redeem orders,
 * including computation of approved amounts and execution of requests.
 * Extends the base Service class with common static methods.
 */
export class RedeemOrderService extends mixinCommonStatics(
  Service<typeof RedeemOrder>,
  RedeemOrder,
  "RedeemOrder"
) {
  /**
   * Approves a redeem order.
   *
   * @param approvedShareAmount - The amount of shares to approve
   * @param approvedPercentageOfTotalPending - The percentage of total pending to approve
   * @param shareDecimals - The number of decimals for the share
   * @param block - The block information
   * @returns The service instance for method chaining
   *
   * @example
   * ```typescript
   * const redeemOrderService = new RedeemOrderService();
   * redeemOrderService.approveRedeem(100n, 50n, { number: 123456, timestamp: 1716792000 });
   * ```
   */
  public approveRedeem(
    approvedShareAmount: bigint,
    block: Event["block"]
  ) {
    console.log(
      `Approving redeem for pool ${this.data.poolId}, token ${this.data.tokenId}, index ${this.data.index}, account ${this.data.account}`
    );
    this.data.approvedSharesAmount = approvedShareAmount;
    this.data.approvedAtBlock = Number(block.number);
    return this;
  }

  /**
   * Revokes shares from a redeem order.
   *
   * @param navAssetPerShare - The NAV asset per share
   * @param navPoolPerShare - The NAV pool per share
   * @param shareDecimals - The number of decimals for the share
   * @param block - The block information
   * @returns The service instance for method chaining
   *
   * @example
   * ```typescript
   * const redeemOrderService = new RedeemOrderService();
   * redeemOrderService.revokeShares(100n, 50n, { number: 123456, timestamp: 1716792000 });
   * ```
   */
  public revokeShares(
    navAssetPerShare: bigint,
    navPoolPerShare: bigint,
    shareDecimals: number,
    block: Event["block"]
  ) {
    console.log(
      `Revoking shares for pool ${this.data.poolId}, token ${this.data.tokenId}, index ${this.data.index}, account ${this.data.account}`
    );
    if (this.data.revokedAt) throw new Error("Shares already revoked");
    if (!this.data.approvedSharesAmount)
      throw new Error("Approved shares amount not set");
    this.data.revokedAt = new Date(Number(block.timestamp) * 1000);
    this.data.revokedAtBlock = Number(block.number);
    this.data.revokedAssetsAmount =
      (this.data.approvedSharesAmount * navAssetPerShare) / 10n ** BigInt(shareDecimals);
    this.data.revokedWithNavAssetPerShare = navAssetPerShare;
    this.data.revokedWithNavPoolPerShare = navPoolPerShare;
    return this;
  }

  /**
   * Claims a redeem order.
   *
   * @param block - The block information
   * @returns The service instance for method chaining
   *
   * @example
   * ```typescript
   * const redeemOrderService = new RedeemOrderService();
   * redeemOrderService.claimRedeem({ number: 123456, timestamp: 1716792000 });
   * ```
   */
  public claimRedeem(block: Event["block"]) {
    console.log(
      `Claiming redeem for pool ${this.data.poolId}, token ${this.data.tokenId}, index ${this.data.index}, account ${this.data.account}`
    );
    if (this.data.claimedAt) throw new Error("Redeem already claimed");
    this.data.claimedAt = new Date(Number(block.timestamp) * 1000);
    this.data.claimedAtBlock = Number(block.number);
    return this;
  }
}
