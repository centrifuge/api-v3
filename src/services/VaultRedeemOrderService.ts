import type { Event } from "ponder:registry";
import { VaultRedeemOrder } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { serviceLog } from "../helpers/logger";

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
    serviceLog(`Adding requested shares amount ${requestedSharesAmount} to vault redeem order`);
    this.data.requestedSharesAmount =
      (this.data.requestedSharesAmount ?? 0n) + requestedSharesAmount;
    return this;
  }

  /**
   * Adds claimable assets to the vault redeem order.
   * @param claimableAssetsAmount - The amount of assets claimable
   * @returns The service instance for method chaining
   */
  public claimableRedeem(claimableSharesAmount: bigint) {
    serviceLog(`Adding claimable shares amount ${claimableSharesAmount} to vault redeem order`);
    this.data.claimableSharesAmount =
      (this.data.claimableSharesAmount ?? 0n) + claimableSharesAmount;
    return this;
  }

  /**
   * Redeems assets from the vault redeem order.
   * @param assetsAmount - The amount of assets to redeem
   * @returns The service instance for method chaining
   */
  public redeem(sharesAmount: bigint) {
    serviceLog(`Redeeming shares amount ${sharesAmount} from vault redeem order`);
    this.data.requestedSharesAmount = (this.data.requestedSharesAmount ?? 0n) - sharesAmount;
    this.data.claimableSharesAmount = (this.data.claimableSharesAmount ?? 0n) - sharesAmount;
    return this;
  }

  /**
   * Saves or clears the vault redeem order.
   * @param event - The event containing the block information
   * @returns The service instance for method chaining
   */
  public saveOrClear(event: Event) {
    if (this.data.requestedSharesAmount === 0n && this.data.claimableSharesAmount === 0n) {
      return this.delete();
    }
    return this.save(event);
  }
}
