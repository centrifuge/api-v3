import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { EpochOutstandingInvest } from "ponder:schema";

/**
 * Service class for managing invest orders in the system.
 * 
 * This service handles invest operations for invest orders,
 * including computation of approved amounts and execution of requests.
 * Extends the base Service class with common static methods.
 */
export class EpochOutstandingInvestService extends mixinCommonStatics(Service<typeof EpochOutstandingInvest>, EpochOutstandingInvest, "EpochOutstandingInvest") {
  
  /**
   * Decorates the epoch outstanding invest with the event data.
   * 
   * @param event - The event to decorate the epoch outstanding invest with
   * @returns The current service instance for method chaining
   */
  public decorateEpochOutstandingInvest(event: Event) {
    console.log(`Decorating EpochOutstandingInvest`)
    this.data.updatedAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.updatedAtBlock = Number(event.block.number);
    return this;
  }

  /**
   * Updates the pending assets amount for the epoch outstanding invest.
   * 
   * @param amount - The new pending assets amount to set, as a BigInt value
   * @returns The current service instance for method chaining
   */
  public updatePendingAmount(amount: bigint) {
    console.log(`Updating pending amount to ${amount}`)
    this.data.pendingAssetsAmount = amount;
    return this;
  }

}
