import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { RedeemOrder } from "ponder:schema";


/**
 * Service class for managing redeem orders in the system.
 *
 * This service handles redeem operations for redeem orders,
 * including computation of approved amounts and execution of requests.
 * Extends the base Service class with common static methods.
 */
export class RedeemOrderService extends mixinCommonStatics(
  Service<typeof RedeemOrder>,
  RedeemOrder,
  "RedeemOrder"
) {
  public approveRedeem(
    approvedShareAmount: bigint,
    approvedPercentageOfTotalPending: bigint,
    block: Event["block"]
  ) {
    console.log(`Approving redeem ${approvedShareAmount} ${approvedPercentageOfTotalPending}`)
    this.data.approvedSharesAmount = approvedShareAmount * approvedPercentageOfTotalPending / 10n ** 18n;
    this.data.approvedAt = new Date(Number(block.timestamp) * 1000);
    this.data.approvedAtBlock = Number(block.number);
    return this;
  }

  public revokeShares(navAssetPerShare: bigint, navPoolPerShare: bigint, block: Event["block"]) {
    console.log(`Revoking shares ${navAssetPerShare} ${navPoolPerShare}`)
    if (this.data.revokedAt) throw new Error("Shares already revoked");
    if (!this.data.approvedSharesAmount) throw new Error("Approved shares amount not set")
    this.data.revokedAt = new Date(Number(block.timestamp) * 1000);
    this.data.revokedAtBlock = Number(block.number);
    this.data.revokedAssetsAmount = this.data.approvedSharesAmount * navAssetPerShare / (10n ** 18n);
    this.data.revokedWithNavAssetPerShare = navAssetPerShare;
    this.data.revokedWithNavPoolPerShare = navPoolPerShare;
    return this;
  }

  public claimRedeem(block: Event['block']) {
    console.log(`Claiming redeem`)
    if (this.data.claimedAt) throw new Error("Redeem already claimed");
    this.data.claimedAt = new Date(Number(block.timestamp) * 1000);
    this.data.claimedAtBlock = Number(block.number);
    return this;
  }
}
