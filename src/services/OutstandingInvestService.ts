import type { Context, Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { OutstandingInvest } from "ponder:schema";
import { eq, and } from "drizzle-orm";
import { BN } from "bn.js";

/**
 * Service class for managing outstanding invest orders in the system.
 *
 * This service handles invest operations for outstanding invest orders,
 * including computation of approved amounts and execution of requests.
 * Extends the base Service class with common static methods.
 */
export class OutstandingInvestService extends mixinCommonStatics(
  Service<typeof OutstandingInvest>,
  OutstandingInvest,
  "OutstandingInvest"
) {
  /**
   * Updates the timestamp and block information for the outstanding order.
   *
   * @param updatedAt - The new timestamp when the order was last updated
   * @param updatedAtBlock - The block number when the order was last updated
   * @returns The service instance for method chaining
   */
  public decorateOutstandingOrder(event: Event) {
    console.log(`Decorating OutstandingInvest`)
    this.data.updatedAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.updatedAtBlock = Number(event.block.number);
    return this;
  }

  /**
   * Updates the requested deposit amount for the outstanding order.
   *
   * @param amount - The new requested deposit amount as a bigint
   * @returns The service instance for method chaining
   */
  public updatePendingAmount(amount: bigint) {
    console.info(
      `Updating pending amount for OutstandingInvest ${this.data.poolId}-${this.data.tokenId}-${this.data.account} to ${amount}`
    );
    this.data.pendingAmount = amount;
    return this;
  }

  /**
   * Computes the total outstanding amount for the order.
   *
   * This method calculates the sum of depositAmount, queuedAmount, and pendingAmount
   * and assigns it to the totalOutstandingAmount field of the order.
   *
   * @returns The service instance for method chaining
   * @throws Error if any of the required fields (depositAmount, queuedAmount, pendingAmount) are missing
   */
  public computeTotalOutstandingAmount() {
    console.log(`Computing total outstanding amount`)
    const { depositAmount, queuedAmount, pendingAmount } = this.data;
    if (depositAmount === null || queuedAmount === null || pendingAmount === null)
      throw new Error("Uninitialized required fields");
    this.data.totalOutstandingAmount =
      depositAmount + queuedAmount + pendingAmount;
    return this;
  }

  public processHubDepositRequest(
    queuedUserAssetAmount: bigint,
    pendingUserAssetAmount: bigint
  ) {
    console.log(`Processing hub deposit request`)
    const { queuedAmount, depositAmount, pendingAmount } = this.data;
    if (queuedAmount === null || depositAmount === null || pendingAmount === null) {
      throw new Error("Uninitialized required fields");
    }

    const deltaPendingAmount = queuedAmount - queuedUserAssetAmount + depositAmount - pendingUserAssetAmount;

    // Reduce pendingAmount by the difference in queued and deposit amounts
    this.data.pendingAmount! -= deltaPendingAmount;

    // Update queued and deposit amounts from event
    this.data.queuedAmount = queuedUserAssetAmount;
    this.data.depositAmount = pendingUserAssetAmount;

    return this;
  }
}
