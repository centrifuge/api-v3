// TODO: DEPRECATED to be deleted in future releases
import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { OutstandingInvest } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { timestamper } from "../helpers/timestamper";

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
   * Updates the requested deposit amount for the outstanding order.
   *
   * @param amount - The new requested deposit amount as a bigint
   * @returns The service instance for method chaining
   */
  public updateDepositAmount(depositAmount: bigint) {
    serviceLog(
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
    pendingUserAssetAmount: bigint,
    epochIndex: number
  ) {
    serviceLog(
      `Processing hub deposit request for pool ${this.data.poolId} token ${this.data.tokenId} account ${this.data.account}`
    );
    // Update queued and deposit amounts from event
    this.data.queuedAmount = queuedUserAssetAmount;
    this.data.pendingAmount = pendingUserAssetAmount;
    this.data.epochIndex = epochIndex;
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
  public approveInvest(
    approvedUserAssetAmount: bigint,
    approvedIndex: number,
    event: Extract<Event, { transaction: any }>
  ) {
    serviceLog(
      `Approving invest for outstandingInvest ${this.data.tokenId}-${this.data.assetId}-${this.data.account} for index ${approvedIndex} with approvedUserAssetAmount: ${approvedUserAssetAmount} on block ${event.block.number} and timestamp ${event.block.timestamp}`
    );
    this.data = {
      ...this.data,
      ...timestamper("approved", event),
      approvedAmount: approvedUserAssetAmount,
    };
    return this;
  }

  /**
   * Clears the approved amount for the outstanding order.
   *
   * This method updates the approved amount to 0, timestamp, and block number for the order.
   *
   * @returns The service instance for method chaining
   */
  public clear(event: Event) {
    serviceLog(
      `Clearing outstanding invest ${this.data.tokenId}-${this.data.assetId}-${this.data.account}`
    );
    this.data = {
      ...this.data,
      ...timestamper("cleared", null),
      pendingAmount: this.data.pendingAmount! - this.data.approvedAmount!,
      approvedAmount: 0n,
    };
    if (this.data.queuedAmount! + this.data.pendingAmount! === 0n) return this.delete();
    return this.save(event);
  }

  /**
   * Clears the outstanding invest if the approved amount is 0 and the queued and pending amounts are 0.
   *
   * @returns The service instance for method chaining
   */
  public saveOrClear(event: Event) {
    if (
      this.data.approvedAmount === 0n &&
      this.data.queuedAmount === 0n &&
      this.data.pendingAmount! === 0n
    )
      return this.delete();
    return this.save(event);
  }
}
