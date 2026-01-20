import { VaultDeposit } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { serviceLog } from "../helpers/logger";

/**
 * Service class for managing VaultDeposit entities.
 * 
 * Extends the base Service class with VaultDeposit-specific functionality and common static methods.
 * Provides methods for vault deposit management and other vault deposit-related operations.
 * 
 * @extends {Service<typeof VaultDeposit>}
 */
export class VaultDepositService extends mixinCommonStatics(
  Service<typeof VaultDeposit>,
  VaultDeposit,
  "VaultDeposit"
) {
  /**
   * Sets the epoch index for the vault deposit.
   * @param epochIndex - The epoch index to set.
   * @returns The service instance for method chaining.
   */
  public setEpochIndex(epochIndex: number) {
    serviceLog(`Setting epoch index to ${epochIndex}`)
    this.data.epochIndex = epochIndex;
    return this;
  }
}