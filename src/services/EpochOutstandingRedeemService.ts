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
    serviceLog(`Updating pending amount to ${amount}`);
    this.data.pendingSharesAmount = amount;
    return this;
  }
}
