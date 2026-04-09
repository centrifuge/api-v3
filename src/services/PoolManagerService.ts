import { PoolManager, PoolManagerCrosschainInProgressTypes } from "ponder:schema";
import { Service } from "./Service";
import { serviceLog } from "../helpers/logger";

/**
 * Service class for managing PoolManager entities.
 *
 * Extends the base Service class with PoolManager-specific functionality
 * extending [`Service`](./Service.ts) with the usual entity static methods.
 *
 * @example
 * ```typescript
 * // Create a new pool manager
 * const poolManager = await PoolManagerService.init(context, {
 *   address: "0x1234567890123456789012345678901234567890",
 *   centrifugeId: "centrifuge:123",
 *   poolId: 123n,
 */
export class PoolManagerService extends Service<typeof PoolManager> {
  static readonly entityTable = PoolManager;
  static readonly entityName = "PoolManager";
  /**
   * Sets the isHubManager property for the manager.
   *
   * @param isHubManager - The value to set for isHubManager
   * @returns The service instance for method chaining
   */
  public setIsHubManager(isHubManager: boolean) {
    serviceLog(`Setting isHubManager to ${isHubManager}`);
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
    serviceLog(`Setting isBalancesheetManager to ${isBalancesheetManager}`);
    this.data.isBalancesheetManager = isBalancesheetManager;
    return this;
  }

  /**
   * Sets the crosschain progress for the manager.
   *
   * @param crosschainProgress - The value to set for crosschainProgress
   * @returns The service instance for method chaining
   */
  public setCrosschainInProgress(
    crosschainInProgress?: (typeof PoolManagerCrosschainInProgressTypes)[number]
  ) {
    this.data.crosschainInProgress = crosschainInProgress ?? null;
    serviceLog(`Setting crosschainInProgress to ${crosschainInProgress}`);
    return this;
  }
}
