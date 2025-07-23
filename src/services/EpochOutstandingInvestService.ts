import type { Context, Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { EpochOutstandingInvest } from "ponder:schema";
import { BN } from "bn.js";

/**
 * Service class for managing invest orders in the system.
 * 
 * This service handles invest operations for invest orders,
 * including computation of approved amounts and execution of requests.
 * Extends the base Service class with common static methods.
 */
export class EpochOutstandingInvestService extends mixinCommonStatics(Service<typeof EpochOutstandingInvest>, EpochOutstandingInvest, "EpochOutstandingInvest") {
  public decorateEpochOutstandingInvest(event: Event) {
    console.log(`Decorating EpochOutstandingInvest`)
    this.data.updatedAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.updatedAtBlock = Number(event.block.number);
    return this;
  }

  public updatePendingAmount(amount: bigint) {
    console.log(`Updating pending amount to ${amount}`)
    this.data.pendingAssetsAmount = amount;
    return this;
  }

}
