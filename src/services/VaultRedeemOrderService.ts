import type { Event } from "ponder:registry";
import { VaultRedeemOrder } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing VaultRedeem entities.
 *
 * Extends the base Service class with VaultRedeem-specific functionality and common static methods.
 * Provides methods for vault redeem management and other vault redeem-related operations.
 *
 * @extends {Service<typeof VaultRedeemOrder>}
 */
export class VaultRedeemOrderService extends mixinCommonStatics(
  Service<typeof VaultRedeemOrder>,
  VaultRedeemOrder,
  "VaultRedeemOrder"
) {
  /**
   * Adds requested shares to the vault redeem order.
   * @param requestedSharesAmount - The amount of shares requested
   * @returns The service instance for method chaining
   */
  public redeemRequest(requestedSharesAmount: bigint) {
    this.data.requestedSharesAmount =
      (this.data.requestedSharesAmount ?? 0n) + requestedSharesAmount;
    return this;
  }

  /**
   * Adds claimable assets to the vault redeem order.
   * @param claimableAssetsAmount - The amount of assets claimable
   * @returns The service instance for method chaining
   */
  public claimableRedeem(claimableAssetsAmount: bigint) {
    this.data.claimableAssetsAmount =
      (this.data.claimableAssetsAmount ?? 0n) + claimableAssetsAmount;
    return this;
  }

  /**
   * Redeems assets from the vault redeem order.
   * @param assetsAmount - The amount of assets to redeem
   * @returns The service instance for method chaining
   */
  public redeem(assetsAmount: bigint) {
    this.data.requestedSharesAmount = (this.data.requestedSharesAmount ?? 0n) - assetsAmount;
    this.data.claimableAssetsAmount = (this.data.claimableAssetsAmount ?? 0n) - assetsAmount;
    return this;
  }

  /**
   * Saves or clears the vault redeem order.
   * @param event - The event containing the block information
   * @returns The service instance for method chaining
   */
  public saveOrClear(event: Event) {
    if (this.data.requestedSharesAmount === 0n && this.data.claimableAssetsAmount === 0n) {
      return this.delete();
    }
    return this.save(event);
  }
}
