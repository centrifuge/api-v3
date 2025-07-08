import { Vault } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { VaultStatuses } from "ponder:schema";

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
    this.data.status = status;
    return this
  }
}