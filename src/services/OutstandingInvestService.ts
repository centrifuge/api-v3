import { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { OutstandingInvest } from "ponder:schema";
import { serviceLog } from "../helpers/logger";

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
    serviceLog(`Decorating OutstandingInvest ${this.data.tokenId}-${this.data.assetId}-${this.data.account} with event block ${event.block.number} and timestamp ${event.block.timestamp}`);
    this.data.updatedAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.updatedAtTxHash = event.transaction.hash;
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
      `Updating deposit amount for OutstandingInvest pool ${this.data.poolId} token ${this.data.tokenId} account ${this.data.account} to ${depositAmount}`
    );
    this.data.depositAmount = depositAmount;
    return this;
  }

  /**
   * Processes a hub deposit request for the outstanding order.
   *
   * This method updates the pending amount based on the difference between queued and deposit amounts.
   * It also updates the queued and deposit amounts from the event.
   *
   * @param queuedUserAssetAmount - The amount of queued user asset
   * @param pendingUserAssetAmount - The amount of pending user asset
   * @returns The service instance for method chaining
   */
  public processHubDepositRequest(
    queuedUserAssetAmount: bigint,
    pendingUserAssetAmount: bigint
  ) {
    serviceLog(
      `Processing hub deposit request for pool ${this.data.poolId} token ${this.data.tokenId} account ${this.data.account}`
    );
    // Update queued and deposit amounts from event
    this.data.queuedAmount = queuedUserAssetAmount;
    this.data.pendingAmount = pendingUserAssetAmount;
    return this;
  }

  /**
   * Approves an invest for the outstanding order.
   *
   * This method updates the last approved amount, timestamp, and block number for the order.
   *
   * @param approvedUserAssetAmount - The amount of approved user asset
   * @param event - The event that triggered the approval
   * @returns The service instance for method chaining
   */
  public approveInvest(approvedUserAssetAmount: bigint, approvedIndex: number, event: Event) {
    serviceLog(
      `Approving invest for outstandingInvest ${this.data.tokenId}-${this.data.assetId}-${this.data.account} for index ${approvedIndex} with approvedUserAssetAmount: ${approvedUserAssetAmount} on block ${event.block.number} and timestamp ${event.block.timestamp}`
    );
    this.data.approvedIndex = approvedIndex;
    this.data.approvedAmount = approvedUserAssetAmount;
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
      `Clearing outstanding invest ${this.data.tokenId}-${this.data.assetId}-${this.data.account}`
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
   * Clears the outstanding invest if the approved amount is 0 and the queued and pending amounts are 0.
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
