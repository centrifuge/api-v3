import { EpochRedeemOrder } from "ponder:schema";
import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing epoch redeem orders in the database.
 * 
 * Extends the base Service class with common static methods.
 */
export class EpochRedeemOrderService extends mixinCommonStatics(
  Service<typeof EpochRedeemOrder>,
  EpochRedeemOrder,
  "EpochRedeemOrder"
) {
  /**
   * Revokes shares for an epoch redeem order.
   * 
   * @param revokedSharesAmount - The amount of shares revoked
   * @param revokedAssetsAmount - The amount of assets revoked
   * @param revokedPoolAmount - The amount of pool revoked
   * @param revokedWithNavPoolPerShare - The NAV per share for the pool
   * @param revokedWithNavAssetPerShare - The NAV per share for the asset
   * @param event - The event containing the block information
   * @returns The service instance for method chaining
   */
  public revokedShares(revokedSharesAmount: bigint, revokedAssetsAmount: bigint, revokedPoolAmount: bigint, revokedWithNavPoolPerShare: bigint, revokedWithNavAssetPerShare: bigint, event: Event) {
    this.data.revokedSharesAmount = revokedSharesAmount;
    this.data.revokedAssetsAmount = revokedAssetsAmount;
    this.data.revokedPoolAmount = revokedPoolAmount;
    this.data.revokedWithNavPoolPerShare = revokedWithNavPoolPerShare;
    this.data.revokedWithNavAssetPerShare = revokedWithNavAssetPerShare;
    this.data.revokedAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.revokedAtBlock = Number(event.block.number);
    return this;
  }
}