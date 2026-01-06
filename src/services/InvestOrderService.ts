import type { Event } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { InvestOrder } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { timestamper } from "../helpers/timestamper";

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
   * Fills an invest order with the given queued and pending assets amounts.
   *
   * @param queuedAssetsAmount - The amount of assets queued
   * @param pendingAssetsAmount - The amount of assets pending
   * @param event - The event containing the block information
   * @returns The service instance for method chaining
   */
  public post(
    postedAssetsAmount: bigint,
    event: Extract<Event, { transaction: any }>
  ) {
    serviceLog(
      `Filling investOrder ${this.data.tokenId}-${this.data.assetId}-${this.data.account}-${this.data.index} with postedAssetsAmount: ${postedAssetsAmount}`
    );
    this.data = {
      ...this.data,
      postedAssetsAmount,
      ...timestamper("posted", event),
    };
    return this;
  }

  /**
   * Approves an invest order with the given approved assets amount.
   *
   * @param approvedAssetsAmount - The amount of assets approved
   * @param event - The event containing the block information
   * @returns The service instance for method chaining
   */
  public approve(
    approvedAssetsAmount: bigint,
    event: Extract<Event, { transaction: any }>
  ) {
    serviceLog(
      `Approving investOrder ${this.data.tokenId}-${this.data.assetId}-${this.data.account}-${this.data.index} with approvedAssetsAmount: ${approvedAssetsAmount}`
    );
    this.data = {
      ...this.data,
      approvedAssetsAmount,
      ...timestamper("approved", event),
    };
    return this;
  }

  /**
   * Issues shares for an invest order and updates the issuance details.
   *
   * This method calculates the issued shares amount based on the approved assets amount
   * and the NAV per share, then updates the issuance timestamp and block number.
   *
   * @param navAssetPerShare - The NAV per share for the asset
   * @param navPoolPerShare - The NAV per share for the pool
   * @param event - The event containing the block information
   * @returns The service instance for method chaining
   */
  public issueShares(
    navAssetPerShare: bigint, // 18 decimals
    navPoolPerShare: bigint, // 18 decimals
    assetDecimals: number,
    shareDecimals: number,
    event: Extract<Event, { transaction: any }>
  ) {
    serviceLog(
      `Issuing shares for investOrder ${this.data.tokenId}-${this.data.assetId}-${this.data.account}-${this.data.index} navAssetPerShare: ${navAssetPerShare} navPoolPerShare: ${navPoolPerShare}`
    );
    if (this.data.issuedAt) throw new Error("Shares already issued");
    if (this.data.approvedAssetsAmount === null)
      throw new Error("No assets approved");

    this.data = {
      ...this.data,
      ...timestamper("issued", event),
      issuedSharesAmount:
        (this.data.approvedAssetsAmount *
          10n ** BigInt(18 + shareDecimals - assetDecimals)) /
        navAssetPerShare,
      issuedWithNavAssetPerShare: navAssetPerShare,
      issuedWithNavPoolPerShare: navPoolPerShare,
    };

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
  public claimDeposit(
    claimedSharesAmount: bigint,
    event: Extract<Event, { transaction: any }>
  ) {
    serviceLog(
      `Claiming deposit for investOrder ${this.data.tokenId}-${this.data.assetId}-${this.data.account}-${this.data.index} on block ${event.block.number} with timestamp ${event.block.timestamp}`
    );
    if (this.data.claimedAt) throw new Error("Deposit already claimed");

    this.data = {
      ...this.data,
      claimedSharesAmount,
      ...timestamper("claimed", event),
    };
    return this;
  }

  /**
   * Checks if the invest order has a vault deposit.
   *
   * @returns True if the invest order has a vault deposit, false otherwise
   */
  public hasVaultDeposit() {
    return (
      !!this.data.vaultDepositCentrifugeId &&
      !!this.data.vaultDepositTxHash
    );
  }

  /**
   * Sets the vault deposit for the invest order.
   *
   * @param vaultDepositCentrifugeId - The centrifuge ID
   * @param vaultDepositTxHash - The transaction hash
   * @returns The service instance for method chaining
   */
  public setVaultDeposit(vaultDepositCentrifugeId: string, vaultDepositTxHash: `0x${string}`) {
    this.data = {
      ...this.data,
      vaultDepositCentrifugeId,
      vaultDepositTxHash,
    };
    return this;
  }

  /**
   * Saves or clears the invest order.
   *
   * @param event - The event containing the block information
   * @returns The service instance for method chaining
   */
  public saveOrClear(event: Event) {
    if(this.data.postedAssetsAmount === 0n) return this.delete();
    return this.save(event);
  }
}
