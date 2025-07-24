import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { OutstandingRedeem } from "ponder:schema";

/**
 * Service class for managing outstanding redeem orders in the system.
 *
 * This service handles redeem operations for outstanding redeem orders,
 * including computation of approved amounts and execution of requests.
 * Extends the base Service class with common static methods.
 */
export class OutstandingRedeemService extends mixinCommonStatics(
  Service<typeof OutstandingRedeem>,
  OutstandingRedeem,
  "OutstandingRedeem"
) {
  /**
   * Updates the timestamp and block information for the outstanding order.
   *
   * @param updatedAt - The new timestamp when the order was last updated
   * @param updatedAtBlock - The block number when the order was last updated
   * @returns The service instance for method chaining
   */
  public decorateOutstandingOrder(event: Event) {
    console.log(`Decorating OutstandingRedeem pool ${this.data.poolId} token ${this.data.tokenId} asset ${this.data.assetId} account ${this.data.account}`)
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
      `Updating pending amount for OutstandingRedeem ${this.data.poolId}-${this.data.tokenId}-${this.data.account} to ${amount}`
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
    console.log(`Computing total outstanding amount for pool ${this.data.poolId} token ${this.data.tokenId} asset ${this.data.assetId} account ${this.data.account}`)
    const { depositAmount, queuedAmount, pendingAmount } = this.data;
    if (
      depositAmount === null ||
      queuedAmount === null ||
      pendingAmount === null
    )
      throw new Error("Uninitialized required fields");
    this.data.totalOutstandingAmount =
      depositAmount + queuedAmount + pendingAmount;
    return this;
  }

  /**
   * Processes a hub redeem request for the outstanding order.
   *
   * This method updates the pending amount based on the difference between queued and deposit amounts.
   * It also updates the queued and deposit amounts from the event.
   *
   * @param queuedUserShareAmount - The amount of queued user share
   * @param pendingUserShareAmount - The amount of pending user share
   * @returns The service instance for method chaining
   */
  public processHubRedeemRequest(
    queuedUserShareAmount: bigint,
    pendingUserShareAmount: bigint
  ) {
    console.log(`Processing hub redeem request for pool ${this.data.poolId} token ${this.data.tokenId} asset ${this.data.assetId} account ${this.data.account}`)
    const { depositAmount, queuedAmount, pendingAmount } = this.data;
    if (
      depositAmount === null ||
      queuedAmount === null ||
      pendingAmount === null
    )
      throw new Error("Uninitialized required fields");
    const deltaPendingAmount =
      queuedAmount -
      queuedUserShareAmount +
      depositAmount -
      pendingUserShareAmount;
    this.data.pendingAmount! -= deltaPendingAmount;
    this.data.queuedAmount = queuedUserShareAmount;
    this.data.depositAmount = pendingUserShareAmount;
    return this;
  }
}
