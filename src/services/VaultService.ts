import { Vault, VaultCrosschainInProgressTypes } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
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
export class VaultService extends mixinCommonStatics(Service<typeof Vault>, Vault, "Vault") {
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
    crosschainInProgress?: (typeof VaultCrosschainInProgressTypes)[number]
  ) {
    this.data.crosschainInProgress = crosschainInProgress ?? null;
    serviceLog(`Setting crosschainInProgress to ${crosschainInProgress}`);
    return this;
  }
}
