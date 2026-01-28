import { VaultInvestOrder } from "ponder:schema";
import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { serviceLog } from "../helpers/logger";

/**
 * Service class for managing VaultInvestOrder entities.
 *
 * Extends the base Service class with VaultInvestOrder-specific functionality and common static methods.
 * Provides methods for vault deposit management and other vault deposit-related operations.
 *
 * @extends {Service<typeof VaultInvestOrder>}
 */
export class VaultInvestOrderService extends mixinCommonStatics(
  Service<typeof VaultInvestOrder>,
  VaultInvestOrder,
  "VaultInvestOrder"
) {
  /**
   * Requests a deposit for the vault invest order.
   * @param requestedAssetsAmount - The amount of assets requested
   * @returns The service instance for method chaining
   */
  public depositRequest(requestedAssetsAmount: bigint) {
    serviceLog(`Adding requested assets amount ${requestedAssetsAmount} to vault invest order`);
    this.data.requestedAssetsAmount =
      (this.data.requestedAssetsAmount ?? 0n) + requestedAssetsAmount;
    return this;
  }

  /**
   * Adds claimable shares to the vault invest order.
   * @param claimableSharesAmount - The amount of shares claimable
   * @returns The service instance for method chaining
   */
  public claimableDeposit(claimableAssetsAmount: bigint) {
    serviceLog(`Adding claimable assets amount ${claimableAssetsAmount} to vault invest order`);
    this.data.claimableAssetsAmount =
      (this.data.claimableAssetsAmount ?? 0n) + claimableAssetsAmount;
    return this;
  }

  /**
   * Deposits assets into the vault invest order.
   * @param assetsAmount - The amount of assets to deposit
   * @returns The service instance for method chaining
   */
  public deposit(assetsAmount: bigint) {
    serviceLog(`Depositing assets amount ${assetsAmount} into vault invest order`);
    this.data.requestedAssetsAmount = (this.data.requestedAssetsAmount ?? 0n) - assetsAmount;
    this.data.claimableAssetsAmount = (this.data.claimableAssetsAmount ?? 0n) - assetsAmount;
    return this;
  }

  /**
   * Saves or clears the vault invest order.
   * @param event - The event containing the block information
   * @returns The service instance for method chaining
   */
  public saveOrClear(event: Event) {
    if (this.data.requestedAssetsAmount === 0n && this.data.claimableAssetsAmount === 0n) {
      return this.delete();
    }
    return this.save(event);
  }
}
