import { HoldingEscrow } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing HoldingEscrow entities.
 * 
 * This service provides methods to manipulate asset amounts and prices
 * for holding escrow operations. It extends the base Service class
 * with common static functionality.
 * 
 * @extends {Service<typeof HoldingEscrow>}
 */
export class HoldingEscrowService extends mixinCommonStatics(
  Service<typeof HoldingEscrow>,
  HoldingEscrow,
  "HoldingEscrow"
) {
  /**
   * Increases the asset amount in the holding escrow.
   * 
   * @param {bigint} amount - The amount to increase the asset by
   * @returns {HoldingEscrowService} The current service instance for method chaining
   * @throws {Error} When the HoldingEscrow is not initialized (assetAmount is null)
   * 
   * @example
   * ```typescript
   * const service = new HoldingEscrowService(data);
   * service.increaseAssetAmount(1000n);
   * ```
   */
  public increaseAssetAmount(amount: bigint) {
    console.log("Increasing asset amount by: ", amount);
    if (this.data.assetAmount === null) throw new Error("HoldingEscrow not initialized");
    this.data.assetAmount += amount;
    return this;
  }

  /**
   * Decreases the asset amount in the holding escrow.
   * 
   * @param {bigint} amount - The amount to decrease the asset by
   * @returns {HoldingEscrowService} The current service instance for method chaining
   * @throws {Error} When the HoldingEscrow is not initialized (assetAmount is null)
   * 
   * @example
   * ```typescript
   * const service = new HoldingEscrowService(data);
   * service.decreaseAssetAmount(500n);
   * ```
   */
  public decreaseAssetAmount(amount: bigint) {
    console.log("Decreasing asset amount by: ", amount);
    if (this.data.assetAmount === null) throw new Error("HoldingEscrow not initialized");
    this.data.assetAmount -= amount;
    return this;
  }

  /**
   * Sets the asset price in the holding escrow.
   * 
   * @param {bigint} price - The new asset price to set
   * @returns {HoldingEscrowService} The current service instance for method chaining
   * 
   * @example
   * ```typescript
   * const service = new HoldingEscrowService(data);
   * service.setAssetPrice(15000n);
   * ```
   */
  public setAssetPrice(price: bigint) {
    console.log("Setting asset price to: ", price);
    this.data.assetPrice = price;
    return this;
  }
}
