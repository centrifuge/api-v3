import { EpochInvestOrder } from "ponder:schema";
import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { timestamper } from "../helpers/timestamper";

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
   * @param event - The event containing the block information
   * @returns The service instance for method chaining
   */
  public issuedShares(issuedSharesAmount: bigint, issuedWithNavPoolPerShare: bigint, issuedWithNavAssetPerShare: bigint, event:  Extract<Event, { transaction: any }>) {
    this.data = {
      ...this.data,
      ...timestamper("issued", event),
      issuedSharesAmount: issuedSharesAmount,
      issuedWithNavPoolPerShare: issuedWithNavPoolPerShare,
      issuedWithNavAssetPerShare: issuedWithNavAssetPerShare,
    }
    return this;
  }
}