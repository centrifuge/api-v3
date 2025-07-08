import { Holding } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing Holding entities.
 * Provides methods for manipulating holding data including asset quantities,
 * valuations, and liability status.
 * 
 * @extends {Service<typeof Holding>}
 */
export class HoldingService extends mixinCommonStatics(
  Service<typeof Holding>,
  Holding,
  "Holding"
) {

  /**
   * Sets the valuation string for this holding.
   * 
   * @param {string} valuation - The valuation string to set
   * @returns {HoldingService} This instance for method chaining
   */
  public setValuation(valuation: string) {
    this.data.valuation = valuation;
    return this;
  }

  /**
   * Sets whether this holding is a liability.
   * 
   * @param {boolean} isLiability - True if the holding is a liability, false otherwise
   * @returns {HoldingService} This instance for method chaining
   */
  public setIsLiability(isLiability: boolean) {
    this.data.isLiability = isLiability;
    return this;
  }

  /**
   * Increases the asset quantity and total value of this holding.
   * 
   * @param {bigint} amount - The amount to increase the asset quantity by
   * @param {bigint} increaseValue - The value to increase the total value by
   * @param {bigint} pricePoolPerAsset - The price per asset (currently unused parameter)
   * @returns {HoldingService} This instance for method chaining
   * @throws {Error} When asset quantity or total value is null
   */
  public increase(
    amount: bigint,
    increaseValue: bigint,
    pricePoolPerAsset: bigint
  ) {
    const { assetQuantity, totalValue } = this.data;
    if (assetQuantity === null || totalValue === null) {
      throw new Error("Hub asset amount or value is null");
    }
    this.data.assetQuantity! += amount;
    this.data.totalValue! += increaseValue;
    return this;
  }

  /**
   * Decreases the asset quantity and total value of this holding.
   * 
   * @param {bigint} amount - The amount to decrease the asset quantity by
   * @param {bigint} decreaseValue - The value to decrease the total value by
   * @param {bigint} pricePoolPerAsset - The price per asset (currently unused parameter)
   * @returns {HoldingService} This instance for method chaining
   * @throws {Error} When asset quantity or total value is null
   */
  public decrease(
    amount: bigint,
    decreaseValue: bigint,
    pricePoolPerAsset: bigint
  ) {
    const { assetQuantity, totalValue } = this.data;
    if (assetQuantity === null || totalValue === null) {
      throw new Error("Hub asset amount or value is null");
    }
    this.data.assetQuantity! -= amount;
    this.data.totalValue! -= decreaseValue;
    return this;
  }

  /**
   * Updates the total value of this holding by adding or subtracting a difference value.
   * 
   * @param {boolean} isPositive - If true, adds the difference value; if false, subtracts it
   * @param {bigint} diffValue - The difference value to add or subtract
   * @returns {HoldingService} This instance for method chaining
   * @throws {Error} When total value is null
   */
  public update(isPositive: boolean, diffValue: bigint) {
    const { totalValue } = this.data;
    if (totalValue === null) {
      throw new Error("Hub total value is null");
    }
    this.data.totalValue! += isPositive ? diffValue : -diffValue;
    return this;
  }

  /**
   * Marks this holding as initialized.
   * 
   * @returns {HoldingService} This instance for method chaining
   */
  public initialize() {
    this.data.isInitialized = true;
    return this;
  }
}
