import { PoolManager } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing PoolManager entities.
 * 
 * Extends the base Service class with PoolManager-specific functionality
 * and inherits common static methods through mixinCommonStatics.
 * 
 * @example
 * ```typescript
* // Create a new pool manager
 * const poolManager = await PoolManagerService.init(context, {
 *   address: "0x1234567890123456789012345678901234567890",
 *   centrifugeId: "centrifuge:123",
 *   poolId: 123n,
 */
export class PoolManagerService extends mixinCommonStatics(Service<typeof PoolManager>, PoolManager, "PoolManager") {
  /**
   * Sets the isHubManager property for the manager.
   * 
   * @param isHubManager - The value to set for isHubManager
   * @returns The service instance for method chaining
   */
  public setIsHubManager(isHubManager: boolean) {
    this.data.isHubManager = isHubManager;
    return this;
  }

  /**
   * Sets the isBalancesheetManager property for the manager.
   * 
   * @param isBalancesheetManager - The value to set for isBalancesheetManager
   * @returns The service instance for method chaining
   */
  public setIsBalancesheetManager(isBalancesheetManager: boolean) {
    this.data.isBalancesheetManager = isBalancesheetManager;
    return this;
  }
}