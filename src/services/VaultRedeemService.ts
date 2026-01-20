import { VaultRedeem } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { serviceLog } from "../helpers/logger";

/**
 * Service class for managing VaultRedeem entities.
 * 
 * Extends the base Service class with VaultRedeem-specific functionality and common static methods.
 * Provides methods for vault redeem management and other vault redeem-related operations.
 * 
 * @extends {Service<typeof VaultRedeem>}
 */
export class VaultRedeemService extends mixinCommonStatics(
  Service<typeof VaultRedeem>,
  VaultRedeem,
  "VaultRedeem"
) {
  /**
   * Sets the epoch index for the vault redeem.
   * @param epochIndex - The epoch index to set.
   * @returns The service instance for method chaining.
   */
  public setEpochIndex(epochIndex: number) {
    serviceLog(`Setting epoch index to ${epochIndex}`)
    this.data.epochIndex = epochIndex;
    return this;
  }
}