import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { RedeemOrder } from "ponder:schema";
import { serviceLog } from "../helpers/logger";

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
  /**
   * Revokes shares from a redeem order.
   *
   * @param navAssetPerShare - The NAV asset per share
   * @param navPoolPerShare - The NAV pool per share
   * @param shareDecimals - The number of decimals for the share
   * @param block - The block information
   * @returns The service instance for method chaining
   *
   * @example
   * ```typescript
   * const redeemOrderService = new RedeemOrderService();
   * redeemOrderService.revokeShares(100n, 50n, { number: 123456, timestamp: 1716792000 });
   * ```
   */
  public revokeShares(
    navAssetPerShare: bigint,
    navPoolPerShare: bigint,
    tokenDecimals: number,
    assetDecimals: number,
    block: Event["block"]
  ) {
    serviceLog(
      `Revoking shares for ${this.data.tokenId}-${this.data.assetId}-${this.data.account}-${this.data.index} with navAssetPerShare: ${navAssetPerShare} navPoolPerShare: ${navPoolPerShare} shareDecimals: ${tokenDecimals} on block ${block.number} and timestamp ${block.timestamp}`
    );
    const poolDecimals = tokenDecimals;
    if (this.data.revokedAt) throw new Error("Shares already revoked");
    this.data.revokedAt = new Date(Number(block.timestamp) * 1000);
    this.data.revokedAtBlock = Number(block.number);
    this.data.revokedAssetsAmount = (this.data.approvedSharesAmount! * navAssetPerShare) / 10n ** BigInt(18 + tokenDecimals - assetDecimals);
    this.data.revokedPoolAmount = (this.data.approvedSharesAmount! * navPoolPerShare) / 10n ** BigInt(18 + tokenDecimals - poolDecimals);
    this.data.revokedWithNavAssetPerShare = navAssetPerShare;
    this.data.revokedWithNavPoolPerShare = navPoolPerShare;
    return this;
  }

  /**
   * Claims a redeem order.
   *
   * @param block - The block information
   * @returns The service instance for method chaining
   *
   * @example
   * ```typescript
   * const redeemOrderService = new RedeemOrderService();
   * redeemOrderService.claimRedeem({ number: 123456, timestamp: 1716792000 });
   * ```
   */
  public claimRedeem(block: Event["block"]) {
    serviceLog(
      `Claiming redeem for ${this.data.tokenId}-${this.data.assetId}-${this.data.account}-${this.data.index} on block ${block.number} and timestamp ${block.timestamp}`
    );
    if (this.data.claimedAt) throw new Error("Redeem already claimed");
    this.data.claimedAt = new Date(Number(block.timestamp) * 1000);
    this.data.claimedAtBlock = Number(block.number);
    return this;
  }
}
