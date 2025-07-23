import type { Context, Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { EpochOutstandingRedeem } from "ponder:schema";
import { BN } from "bn.js";

/**
 * Service class for managing invest orders in the system.
 * 
 * This service handles invest operations for invest orders,
 * including computation of approved amounts and execution of requests.
 * Extends the base Service class with common static methods.
 */
export class EpochOutstandingRedeemService extends mixinCommonStatics(Service<typeof EpochOutstandingRedeem>, EpochOutstandingRedeem, "EpochOutstandingRedeem") {

  public decorateEpochOutstandingRedeem(event: Event) {
    console.log(`Decorating EpochOutstandingRedeem`)
    this.data.updatedAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.updatedAtBlock = Number(event.block.number);
    return this;
  }

  public updatePendingAmount(amount: bigint) {
    console.log(`Updating pending amount to ${amount}`)
    this.data.pendingSharesAmount = amount;
    return this;
  }
}
