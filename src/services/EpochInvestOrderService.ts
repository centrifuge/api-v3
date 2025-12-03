import { EpochInvestOrder } from "ponder:schema";
import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing epoch invest orders in the database.
 *  
 * Extends the base Service class with common static methods.
 */
export class EpochInvestOrderService extends mixinCommonStatics(
  Service<typeof EpochInvestOrder>,
  EpochInvestOrder,
  "EpochInvestOrder"
) {
  /**
   * Issues shares for an epoch invest order.
   * 
   * @param issuedSharesAmount - The amount of shares issued
   * @param issuedWithNavPoolPerShare - The NAV per share for the pool
   * @param issuedWithNavAssetPerShare - The NAV per share for the asset
   * @param event - The event information
   * @returns The service instance for method chaining
   */
  public issuedShares(issuedSharesAmount: bigint, issuedWithNavPoolPerShare: bigint, issuedWithNavAssetPerShare: bigint, event: Event) {
    this.data.issuedSharesAmount = issuedSharesAmount;
    this.data.issuedWithNavPoolPerShare = issuedWithNavPoolPerShare;
    this.data.issuedWithNavAssetPerShare = issuedWithNavAssetPerShare;
    this.data.issuedAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.issuedAtTxHash = event.transaction.hash;
    return this;
  }
}