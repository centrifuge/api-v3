import { Context } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { OutstandingOrder } from "ponder:schema";
import { eq, and } from "drizzle-orm";
import { BN } from "bn.js";

/**
 * Service class for managing outstanding orders in the system.
 * 
 * This service handles deposit and redeem operations for outstanding orders,
 * including computation of approved amounts and execution of requests.
 * Extends the base Service class with common static methods.
 */
export class OutstandingOrderService extends mixinCommonStatics(Service<typeof OutstandingOrder>, OutstandingOrder, "OutstandingOrder") {
  
  /**
   * Updates the timestamp and block information for the outstanding order.
   * 
   * @param updatedAt - The new timestamp when the order was last updated
   * @param updatedAtBlock - The block number when the order was last updated
   * @returns The service instance for method chaining
   */
  public decorateOutstandingOrder(
    updatedAt: Date,
    updatedAtBlock: number,
  ) {
    this.data.updatedAt = updatedAt;
    this.data.updatedAtBlock = updatedAtBlock;
    return this;
  }

  /**
   * Updates the requested deposit amount for the outstanding order.
   * 
   * @param amount - The new requested deposit amount as a bigint
   * @returns The service instance for method chaining
   */
  public updateRequestedDepositAmount(amount: bigint) {
    console.info(
      `Updating deposit amount for OutstandingOrder ${this.data.poolId}-${this.data.tokenId}-${this.data.account} to ${amount}`
    );
    this.data.requestedDepositAmount = amount;
    return this;
  }

  /**
   * Updates the requested redeem amount for the outstanding order.
   * 
   * @param amount - The new requested redeem amount as a bigint
   * @returns The service instance for method chaining
   */
  public updateRequestedRedeemAmount(amount: bigint) {
    console.info(
      `Updating redeem amount for OutstandingOrder ${this.data.poolId}-${this.data.tokenId}-${this.data.account} to ${amount}`
    );
    this.data.requestedRedeemAmount = amount;
    return this;
  }

  /**
   * Computes the approved deposit amount based on available assets and pending amounts.
   * 
   * Uses the formula: requestedDepositAmount * (approvedAssetAmount / (approvedAssetAmount + pendingAssetAmount))
   * This ensures proportional distribution of available assets among pending requests.
   * 
   * @param approvedAssetAmount - The total amount of approved assets available
   * @param pendingAssetAmount - The total amount of pending assets
   * @returns The service instance for method chaining
   * @throws {Error} When requestedDepositAmount is not set
   */
  public computeApprovedDepositAmount(
    approvedAssetAmount: bigint,
    pendingAssetAmount: bigint
  ) {
    if (this.data.requestedDepositAmount === null)
      throw new Error(
        `Requested deposit amount for OutstandingOrder ${this.data.poolId}-${this.data.tokenId}-${this.data.account} is not set`
      );
    const _requestedDepositAmount = new BN(
      this.data.requestedDepositAmount.toString()
    );
    const _approvedAssetAmount = new BN(approvedAssetAmount.toString());
    const _pendingAssetAmount = new BN(pendingAssetAmount.toString());
    //approvedAssetAmount / (approvedAssetAmount + _pendingDeposit)
    const _approvedDepositAmount = _requestedDepositAmount
      .mul(_approvedAssetAmount)
      .div(_approvedAssetAmount.add(_pendingAssetAmount));
    this.data.approvedDepositAmount = BigInt(_approvedDepositAmount.toString());
    console.info(
      `Computed approved deposit amount for OutstandingOrder ${this.data.poolId}-${this.data.tokenId}-${this.data.account} to ${this.data.approvedDepositAmount}`
    );
    return this;
  }

  /**
   * Computes the approved redeem amount based on available share class amounts and pending amounts.
   * 
   * Uses the formula: requestedRedeemAmount * (approvedShareClassAmount / (approvedShareClassAmount + pendingShareClassAmount))
   * This ensures proportional distribution of available share classes among pending requests.
   * 
   * @param approvedShareClassAmount - The total amount of approved share classes available
   * @param pendingShareClassAmount - The total amount of pending share classes
   * @returns The service instance for method chaining
   * @throws {Error} When requestedRedeemAmount is not set
   */
  public computeApprovedRedeemAmount(
    approvedShareClassAmount: bigint,
    pendingShareClassAmount: bigint
  ) {
    if (this.data.requestedRedeemAmount === null)
      throw new Error(
        `Requested redeem amount for OutstandingOrder ${this.data.poolId}-${this.data.tokenId}-${this.data.account} is not set`
      );
    const _requestedRedeemAmount = new BN(
      this.data.requestedRedeemAmount.toString()
    );
    const _approvedShareClassAmount = new BN(
      approvedShareClassAmount.toString()
    );
    const _pendingShareClassAmount = new BN(pendingShareClassAmount.toString());
    const _approvedRedeemAmount = _requestedRedeemAmount
      .mul(_approvedShareClassAmount)
      .div(_approvedShareClassAmount.add(_pendingShareClassAmount));
    this.data.approvedRedeemAmount = BigInt(_approvedRedeemAmount.toString());
    console.info(
      `Computed approved redeem amount for OutstandingOrder ${this.data.poolId}-${this.data.tokenId}-${this.data.account} to ${this.data.approvedRedeemAmount}`
    );
    return this;
  }

  /**
   * Executes the approved deposit and redeem requests by subtracting the approved amounts
   * from the requested amounts and resetting the approved amounts to zero.
   * 
   * This method processes both deposit and redeem operations in sequence.
   * 
   * @returns The service instance for method chaining
   * @throws {Error} When requestedDepositAmount, approvedDepositAmount, requestedRedeemAmount, or approvedRedeemAmount is not set
   */
  public executeRequests() {
    if (this.data.requestedDepositAmount === null)
      throw new Error(
        `Requested deposit amount for OutstandingOrder ${this.data.poolId}-${this.data.tokenId}-${this.data.account} is not set`
      );
    if (this.data.approvedDepositAmount === null)
      throw new Error(
        `Approved deposit amount for OutstandingOrder ${this.data.poolId}-${this.data.tokenId}-${this.data.account} is not set`
      );
    this.data.requestedDepositAmount -= this.data.approvedDepositAmount;
    this.data.approvedDepositAmount = 0n;

    if (this.data.requestedRedeemAmount === null)
      throw new Error(
        `Requested redeem amount for OutstandingOrder ${this.data.poolId}-${this.data.tokenId}-${this.data.account} is not set`
      );
    if (this.data.approvedRedeemAmount === null)
      throw new Error(
        `Approved redeem amount for OutstandingOrder ${this.data.poolId}-${this.data.tokenId}-${this.data.account} is not set`
      );
    this.data.requestedRedeemAmount -= this.data.approvedRedeemAmount;
    this.data.approvedRedeemAmount = 0n;
    return this;
  }

  /**
   * Removes the outstanding order from the database.
   * 
   * Deletes the record based on the combination of poolId, tokenId, and account.
   * 
   * @returns Promise that resolves when the deletion is complete
   */
  public async clear() {
    console.info(
      `Clearing OutstandingOrder ${this.data.poolId}-${this.data.tokenId}-${this.data.account}`
    );
    await this.db.sql
      .delete(OutstandingOrder)
      .where(
        and(
          eq(this.table.poolId, this.data.poolId),
          eq(this.table.tokenId, this.data.tokenId),
          eq(this.table.account, this.data.account)
        )
      );
  }
}
