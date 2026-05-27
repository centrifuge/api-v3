import { Holding } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { Service } from "./Service";

/**
 * Service class for managing Holding entities.
 * Provides methods for manipulating holding data including asset quantities,
 * valuations, and liability status.
 *
 * @extends {Service<typeof Holding>}
 */
export class HoldingService extends Service<typeof Holding> {
  static readonly entityTable = Holding;
  static readonly entityName = "Holding";
  /**
   * Sets the valuation string for this holding.
   *
   * @param {string} valuation - The valuation string to set
   * @returns {HoldingService} This instance for method chaining
   */
  public setValuation(valuation: string) {
    serviceLog(`Holding setValuation poolId=${this.data.poolId} valuation=${valuation}`);
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
    serviceLog(`Holding setIsLiability poolId=${this.data.poolId} isLiability=${isLiability}`);
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
  public increase(amount: bigint, increaseValue: bigint) {
    serviceLog(
      `Holding increase poolId=${this.data.poolId} amount=${amount} value=${increaseValue}`
    );
    const { assetQuantity, totalValue } = this.data;
    this.data.assetQuantity = assetQuantity ?? 0n + amount;
    this.data.totalValue = totalValue ?? 0n + increaseValue;
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
  public decrease(amount: bigint, decreaseValue: bigint) {
    serviceLog(
      `Holding decrease poolId=${this.data.poolId} amount=${amount} value=${decreaseValue}`
    );
    const { assetQuantity, totalValue } = this.data;
    this.data.assetQuantity = assetQuantity ?? 0n - amount;
    this.data.totalValue = totalValue ?? 0n - decreaseValue;
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
    serviceLog(
      `Holding update poolId=${this.data.poolId} isPositive=${isPositive} diffValue=${diffValue}`
    );
    const { totalValue } = this.data;
    this.data.totalValue = totalValue ?? 0n + (isPositive ? diffValue : -diffValue);
    return this;
  }

  /**
   * Marks this holding as initialized.
   *
   * @returns {HoldingService} This instance for method chaining
   */
  public initialize() {
    serviceLog(`Holding initialize poolId=${this.data.poolId}`);
    this.data.isInitialized = true;
    return this;
  }
}
