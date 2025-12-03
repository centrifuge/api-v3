import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { OutstandingRedeem } from "ponder:schema";
import { serviceLog } from "../helpers/logger";

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
    serviceLog(
      `Decorating OutstandingRedeem ${this.data.tokenId}-${this.data.assetId}-${this.data.account} with event block ${event.block.number} and timestamp ${event.block.timestamp}`
    );
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
  public updateDepositAmount(depositAmount: bigint) {
    console.info(
      `Updating deposit amount for OutstandingRedeem ${this.data.tokenId}-${this.data.assetId}-${this.data.account} to ${depositAmount}`
    );
    this.data.depositAmount = depositAmount;
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
    serviceLog(
      `Processing hub redeem request for ${this.data.tokenId}-${this.data.assetId}-${this.data.account} with queuedUserShareAmount: ${queuedUserShareAmount} and pendingUserShareAmount: ${pendingUserShareAmount}`
    );
    this.data.queuedAmount = queuedUserShareAmount;
    this.data.pendingAmount = pendingUserShareAmount;
    return this;
  }

  /**
   * Approves a redeem for the outstanding order.
   *
   * This method updates the last approved amount, timestamp, and block number for the order.
   *
   * @param approvedUserShareAmount - The amount of approved user share
   * @param event - The event that triggered the approval
   * @returns The service instance for method chaining
   */
  public approveRedeem(approvedUserShareAmount: bigint, approvedIndex: number, event: Event) {
    serviceLog(
      `Approving redeem for outstandingRedeem ${this.data.tokenId}-${this.data.assetId}-${this.data.account} for index ${approvedIndex} with approvedUserShareAmount: ${approvedUserShareAmount} on block ${event.block.number} and timestamp ${event.block.timestamp}`
    );
    this.data.approvedIndex = approvedIndex;
    this.data.approvedAmount = approvedUserShareAmount;
    this.data.approvedAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.approvedAtTxHash = event.transaction.hash;
    return this;
  }

  /**
   * Clears the approved amount for the outstanding order.
   *
   * This method updates the approved amount to 0, timestamp, and block number for the order.
   *
   * @returns The service instance for method chaining
   */
  public clear(block: Event["block"]) {
    serviceLog(
      `Clearing outstanding redeem ${this.data.tokenId}-${this.data.assetId}-${this.data.account} on block ${block.number} and timestamp ${block.timestamp}`
    );
    this.data.pendingAmount! -= this.data.approvedAmount!;
    this.data.approvedAmount = 0n;
    this.data.approvedAt = null;
    this.data.approvedAtBlock = null;
    if (this.data.queuedAmount! + this.data.pendingAmount! === 0n)
      return this.delete();
    return this.save(block);
  }

  /**
   * Saves or clears the outstanding redeem order.
   *
   * This method checks if the approved amount is 0, the queued amount is 0, and the pending amount is 0.
   * If all conditions are met, it deletes the order. Otherwise, it saves the order.
   *
   * @returns The service instance for method chaining
   */
  public saveOrClear(block: Event["block"]) {
    if (
      this.data.approvedAmount === 0n &&
      this.data.queuedAmount === 0n &&
      this.data.pendingAmount! === 0n
    )
      return this.delete();
    return this.save(block);
  }
}
