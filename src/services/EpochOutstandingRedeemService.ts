import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { EpochOutstandingRedeem } from "ponder:schema";
import { serviceLog } from "../helpers/logger";

/**
 * Service class for managing invest orders in the system.
 *
 * This service handles invest operations for invest orders,
 * including computation of approved amounts and execution of requests.
 * Extends the base Service class with common static methods.
 */
export class EpochOutstandingRedeemService extends mixinCommonStatics(
  Service<typeof EpochOutstandingRedeem>,
  EpochOutstandingRedeem,
  "EpochOutstandingRedeem"
) {
  /**
   * Updates the pending shares amount for the epoch outstanding redeem.
   *
   * @param amount - The new pending shares amount to set, as a BigInt value
   * @returns The current service instance for method chaining
   */
  public updatePendingAmount(amount: bigint) {
    serviceLog(`Updating epochpending shares amount to ${amount}`);
    this.data.pendingSharesAmount = amount;
    return this;
  }

  /**
   * Increases the queued shares amount for the epoch outstanding redeem.
   * @param amount - The amount to increase the queued shares amount by
   * @returns The current service instance for method chaining
   */
  public increaseQueuedAmount(amount: bigint) {
    serviceLog(`Increasing epoch queued shares amount by ${amount}`);
    this.data.queuedSharesAmount = (this.data.queuedSharesAmount ?? 0n) + amount;
    return this;
  }

  /**
   * Clears the outstanding redeem if the queued and pending amounts are 0.
   *
   * @returns The service instance for method chaining
   */
  public saveOrClear(event: Event) {
    if (this.data.pendingSharesAmount === 0n && this.data.queuedSharesAmount === 0n)
      return this.delete();
    return this.save(event);
  }
}
