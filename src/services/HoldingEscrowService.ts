import { HoldingEscrow, HoldingEscrowCrosschainInProgressTypes } from "ponder:schema";
import { Service } from "./Service";
import { serviceLog } from "../helpers/logger";

/**
 * Service class for managing HoldingEscrow entities.
 *
 * This service provides methods to manipulate asset amounts and prices
 * for holding escrow operations. It extends the base Service class
 * with common static functionality.
 *
 * @extends {Service<typeof HoldingEscrow>}
 */
export class HoldingEscrowService extends Service<typeof HoldingEscrow> {
  static readonly entityTable = HoldingEscrow;
  static readonly entityName = "HoldingEscrow";
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
    serviceLog("Increasing asset amount by: ", amount);
    this.data.assetAmount = (this.data.assetAmount ?? 0n) + amount;
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
    serviceLog("Decreasing asset amount by: ", amount);
    this.data.assetAmount = (this.data.assetAmount ?? 0n) - amount;
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
    serviceLog("Setting asset price to: ", price);
    this.data.assetPrice = price;
    return this;
  }

  /**
   * Sets the escrow address backing this holding.
   *
   * The escrow can be redeployed/migrated over a pool's lifetime, so handlers refresh this on every
   * update to keep it pointing at the pool's current escrow rather than the one present at creation.
   *
   * @param {`0x${string}`} escrowAddress - The current pool escrow address
   * @returns {HoldingEscrowService} The current service instance for method chaining
   */
  public setEscrowAddress(escrowAddress: `0x${string}`) {
    serviceLog("Setting escrow address to: ", escrowAddress);
    this.data.escrowAddress = escrowAddress;
    return this;
  }

  /**
   * Sets the maximum allowed asset price age (seconds) from the Spoke.
   */
  public setMaxAssetPriceAge(maxPriceAge: bigint) {
    serviceLog("Setting maxAssetPriceAge to: ", maxPriceAge);
    this.data.maxAssetPriceAge = maxPriceAge;
    return this;
  }

  /**
   * @param crosschainInProgress - Set when Hub notifies destination of asset price update; omit to clear
   */
  public setCrosschainInProgress(
    crosschainInProgress?: (typeof HoldingEscrowCrosschainInProgressTypes)[number]
  ) {
    this.data.crosschainInProgress = crosschainInProgress ?? null;
    serviceLog(`Setting crosschainInProgress to ${crosschainInProgress}`);
    return this;
  }
}
