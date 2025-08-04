import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { InvestOrder } from "ponder:schema";

/**
 * Service class for managing invest orders in the system.
 *
 * This service handles invest operations for invest orders,
 * including computation of approved amounts and execution of requests.
 * Extends the base Service class with common static methods.
 */
export class InvestOrderService extends mixinCommonStatics(
  Service<typeof InvestOrder>,
  InvestOrder,
  "InvestOrder"
) {
  /**
   * Issues shares for an invest order and updates the issuance details.
   *
   * This method calculates the issued shares amount based on the approved assets amount
   * and the NAV per share, then updates the issuance timestamp and block number.
   *
   * @param navAssetPerShare - The NAV per share for the asset
   * @param navPoolPerShare - The NAV per share for the pool
   * @param block - The event block containing timestamp and block number
   * @returns The service instance for method chaining
   */
  public issueShares(
    navAssetPerShare: bigint,
    navPoolPerShare: bigint,
    assetDecimals: number,
    block: Event["block"]
  ) {
    console.log(`Issuing shares ${navAssetPerShare} ${navPoolPerShare}`);
    if (this.data.issuedAt) throw new Error("Shares already issued");
    this.data.issuedAt = new Date(Number(block.timestamp) * 1000);
    this.data.issuedAtBlock = Number(block.number);
    this.data.issuedSharesAmount =
      this.data.approvedAssetsAmount! *
      navAssetPerShare /
      10n ** BigInt(assetDecimals);
    this.data.issuedWithNavAssetPerShare = navAssetPerShare;
    this.data.issuedWithNavPoolPerShare = navPoolPerShare;
    return this;
  }

  /**
   * Claims a deposit for an invest order and updates the claim details.
   *
   * This method updates the claim timestamp and block number.
   *
   * @param block - The event block containing timestamp and block number
   * @returns The service instance for method chaining
   */
  public claimDeposit(block: Event["block"]) {
    console.log(`Claiming deposit`);
    if (this.data.claimedAt) throw new Error("Deposit already claimed");
    this.data.claimedAt = new Date(Number(block.timestamp) * 1000);
    this.data.claimedAtBlock = Number(block.number);
    return this;
  }
}
