import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { RedeemOrder } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { timestamper } from "../helpers/timestamper";

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
   * Approves a redeem order with the given approved shares amount.
   *
   * @param approvedSharesAmount - The amount of shares approved
   * @param event - The event containing the block information
   * @returns The service instance for method chaining
   */
  public approve(approvedSharesAmount: bigint, event: Extract<Event, { transaction: any }>) {
    serviceLog(
      `Approving redeemOrder ${this.data.tokenId}-${this.data.assetId}-${this.data.account}-${this.data.index} with approvedSharesAmount: ${approvedSharesAmount}`
    );
    this.data = {
      ...this.data,
      approvedSharesAmount,
      ...timestamper("approved", event),
    };
    return this;
  }

  /**
   * Revokes shares from a redeem order.
   *
   * @param navAssetPerShare - The NAV asset per share
   * @param navPoolPerShare - The NAV pool per share
   * @param shareDecimals - The number of decimals for the share
   * @param event - The event containing the block information
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
    shareDecimals: number,
    assetDecimals: number,
    event: Extract<Event, { transaction: any }>
  ) {
    serviceLog(
      `Revoking shares for ${this.data.tokenId}-${this.data.assetId}-${this.data.account}-${this.data.index} with navAssetPerShare: ${navAssetPerShare} navPoolPerShare: ${navPoolPerShare} shareDecimals: ${shareDecimals} on block ${event.block.number} and timestamp ${event.block.timestamp}`
    );
    const poolDecimals = shareDecimals;
    if (this.data.revokedAt) throw new Error("Shares already revoked");
    if (this.data.approvedSharesAmount === null) throw new Error("No shares approved");
    this.data = {
      ...this.data,
      ...timestamper("revoked", event),
      revokedSharesAmount: this.data.approvedSharesAmount,
      revokedAssetsAmount:
        (this.data.approvedSharesAmount * navAssetPerShare) /
        10n ** BigInt(18 + shareDecimals - assetDecimals),
      revokedPoolAmount:
        (this.data.approvedSharesAmount * navPoolPerShare) /
        10n ** BigInt(18 + shareDecimals - poolDecimals),
      revokedWithNavAssetPerShare: navAssetPerShare,
      revokedWithNavPoolPerShare: navPoolPerShare,
    };
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
  public claimRedeem(claimedAssetsAmount: bigint, event: Extract<Event, { transaction: any }>) {
    serviceLog(
      `Claiming redeem for ${this.data.tokenId}-${this.data.assetId}-${this.data.account}-${this.data.index} on block ${event.block.number} and timestamp ${event.block.timestamp}`
    );
    if (this.data.claimedAt) throw new Error("Redeem already claimed");
    this.data = {
      ...this.data,
      claimedAssetsAmount,
      ...timestamper("claimed", event),
    };
    return this;
  }
}
