import type  { Context, Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { InvestOrder } from "ponder:schema";
import { eq, and } from "drizzle-orm";
import { BN } from "bn.js";

/**
 * Service class for managing invest orders in the system.
 * 
 * This service handles invest operations for invest orders,
 * including computation of approved amounts and execution of requests.
 * Extends the base Service class with common static methods.
 */
export class InvestOrderService extends mixinCommonStatics(Service<typeof InvestOrder>, InvestOrder, "InvestOrder") {
  
  /**
   * Approves a deposit for an invest order and updates the approval details.
   * 
   * This method calculates the approved asset amount based on the total approved amount
   * and the percentage of total pending, then updates the approval timestamp and block number.
   * 
   * @param approvedAssetAmount - The total approved asset amount for the epoch
   * @param approvedPercentageOfTotalPending - The percentage of total pending amount (18 decimals)
   * @param block - The event block containing timestamp and block number
   * @returns The service instance for method chaining
   */
  public approveDeposit(approvedAssetAmount: bigint, approvedPercentageOfTotalPending: bigint, block: Event['block']) {
    console.log(`Approving deposit ${approvedAssetAmount} ${approvedPercentageOfTotalPending}`)
    this.data.approvedAt = new Date(Number(block.timestamp) * 1000);
    this.data.approvedAtBlock = Number(block.number);
    this.data.approvedAssetsAmount = approvedAssetAmount * approvedPercentageOfTotalPending / (10n ** 18n);
    return this;
  }

  public issueShares(navAssetPerShare: bigint, navPoolPerShare: bigint, block: Event['block']) {
    console.log(`Issuing shares ${navAssetPerShare} ${navPoolPerShare}`)
    if (this.data.issuedAt) throw new Error("Shares already issued");
    if (!this.data.approvedAssetsAmount) throw new Error("Approved assets amount not set")
    this.data.issuedAt = new Date(Number(block.timestamp) * 1000);
    this.data.issuedAtBlock = Number(block.number);
    this.data.issuedSharesAmount = this.data.approvedAssetsAmount * navAssetPerShare / (10n ** 18n);
    this.data.issuedWithNavAssetPerShare = navAssetPerShare;
    this.data.issuedWithNavPoolPerShare = navPoolPerShare;
    return this;
  }

  public claimDeposit(block: Event['block']) {
    console.log(`Claiming deposit`)
    if (this.data.claimedAt) throw new Error("Deposit already claimed");
    this.data.claimedAt = new Date(Number(block.timestamp) * 1000);
    this.data.claimedAtBlock = Number(block.number);
    return this;
  }
}
