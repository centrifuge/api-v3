import type { Event } from "ponder:registry";
import { PendingRedeemOrder } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { serviceLog } from "../helpers/logger";

/**
 * Service class for managing pending redeem orders in the system.
 *
 * This service handles pending redeem operations for redeem orders,
 * including computation of approved amounts and execution of requests.
 * Extends the base Service class with common static methods.
 */
export class PendingRedeemOrderService extends mixinCommonStatics(
  Service<typeof PendingRedeemOrder>,
  PendingRedeemOrder,
  "PendingRedeemOrder"
) {
  /**
   * Updates the pending shares amount for the pending redeem order.
   * @param pendingSharesAmount - The amount of shares pending
   * @returns The service instance for method chaining
   */
  public updatePendingAmount(pendingSharesAmount: bigint) {
    serviceLog(`Updating pending shares amount to ${pendingSharesAmount}`);
    this.data.pendingSharesAmount = pendingSharesAmount;
    return this;
  }

  /**
   * Updates the queued shares amount for the pending redeem order.
   * @param queuedSharesAmount - The amount of shares queued
   * @returns The service instance for method chaining
   */
  public updateQueuedAmount(queuedSharesAmount: bigint) {
    serviceLog(`Updating queued shares amount to ${queuedSharesAmount}`);
    this.data.queuedSharesAmount = queuedSharesAmount;
    return this;
  }

  public saveOrClear(event: Event) {
    if (this.data.pendingSharesAmount === 0n && this.data.queuedSharesAmount === 0n) {
      return this.delete();
    }
    return this.save(event);
  }
}
