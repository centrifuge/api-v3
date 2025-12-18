import { Service, mixinCommonStatics } from "./Service";
import { EpochOutstandingInvest } from "ponder:schema";
import { serviceLog } from "../helpers/logger";


/**
 * Service class for managing invest orders in the system.
 * 
 * This service handles invest operations for invest orders,
 * including computation of approved amounts and execution of requests.
 * Extends the base Service class with common static methods.
 */
export class EpochOutstandingInvestService extends mixinCommonStatics(Service<typeof EpochOutstandingInvest>, EpochOutstandingInvest, "EpochOutstandingInvest") {
  /**
   * Updates the pending assets amount for the epoch outstanding invest.
   * 
   * @param amount - The new pending assets amount to set, as a BigInt value
   * @returns The current service instance for method chaining
   */
  public updatePendingAmount(amount: bigint) {
    serviceLog(`Updating pending amount to ${amount}`)
    this.data.pendingAssetsAmount = amount;
    return this;
  }

}
