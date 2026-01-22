import type { Event } from "ponder:registry";
import { PendingInvestOrder } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing pending invest orders in the system.
 *
 * This service handles pending invest operations for invest orders,
 * including computation of approved amounts and execution of requests.
 * Extends the base Service class with common static methods.
 */
export class PendingInvestOrderService extends mixinCommonStatics(
  Service<typeof PendingInvestOrder>,
  PendingInvestOrder,
  "PendingInvestOrder"
) {
  /**
   * Updates the pending assets amount for the pending invest order.
   * @param pendingAssetsAmount - The amount of assets pending
   * @returns The service instance for method chaining
   */
  public updatePendingAmount(pendingAssetsAmount: bigint) {
    this.data.pendingAssetsAmount = pendingAssetsAmount;
    return this;
  }

  /**
   * Updates the queued assets amount for the pending invest order.
   * @param queuedAssetsAmount - The amount of assets queued
   * @returns The service instance for method chaining
   */
  public updateQueuedAmount(queuedAssetsAmount: bigint) {
    this.data.queuedAssetsAmount = queuedAssetsAmount;
    return this;
  }

  /**
   * Saves or clears the pending invest order.
   * @param event - The event containing the block information
   * @returns The service instance for method chaining
   */
  public saveOrClear(event: Event) {
    if (this.data.pendingAssetsAmount === 0n && this.data.queuedAssetsAmount === 0n) {
      return this.delete();
    }
    return this.save(event);
  }
}
