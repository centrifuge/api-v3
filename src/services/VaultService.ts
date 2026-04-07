import { Vault, VaultCrosschainInProgressTypes } from "ponder:schema";
import { Service } from "./Service";
import { VaultStatuses } from "ponder:schema";
import { serviceLog } from "../helpers/logger";

/**
 * Service class for managing Vault entities.
 *
 * Extends the base Service class with Vault-specific functionality and common static methods.
 * Provides methods for vault status management and other vault-related operations.
 *
 * @extends {Service<typeof Vault>}
 */
export class VaultService extends Service<typeof Vault> {
  static readonly entityTable = Vault;
  static readonly entityName = "Vault";
  /**
   * Sets the status of the vault.
   *
   * Updates the vault's status to the specified value and returns the service instance
   * for method chaining.
   *
   * @param {VaultStatuses[number]} status - The new status to set for the vault
   * @returns {VaultService} The current service instance for method chaining
   *
   * @example
   * ```typescript
   * const vaultService = new VaultService();
   * vaultService.setStatus('active');
   * ```
   */
  public setStatus(status: (typeof VaultStatuses)[number]) {
    serviceLog(`Setting status to ${status}`);
    this.data.status = status;
    return this;
  }

  /**
   * Sets the crosschain progress for the vault.
   *
   * @param crosschainInProgress - The value to set for crosschainInProgress
   * @returns The service instance for method chaining
   */
  public setCrosschainInProgress(
    crosschainInProgress?: (typeof VaultCrosschainInProgressTypes)[number],
    crosschainInProgressValue?: bigint
  ) {
    this.data.crosschainInProgress = crosschainInProgress ?? null;
    this.data.crosschainInProgressValue = crosschainInProgressValue ?? null;
    serviceLog(
      `Setting crosschainInProgress to ${crosschainInProgress} with value ${crosschainInProgressValue}`
    );
    return this;
  }

  /**
   * Sets the max reserve for the vault.
   *
   * @param maxReserve - The value to set for maxReserve
   * @returns The service instance for method chaining
   */
  public setMaxReserve(maxReserve: bigint) {
    this.data.maxReserve = maxReserve;
    serviceLog(`Setting maxReserve to ${maxReserve}`);
    return this;
  }
}
