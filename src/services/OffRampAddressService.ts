import { OffRampAddress, OffRampAddressCrosschainInProgressTypes } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { Service } from "./Service";

/**
 * Service for managing off-ramp addresses
 *
 */
export class OffRampAddressService extends Service<typeof OffRampAddress> {
  static readonly entityTable = OffRampAddress;
  static readonly entityName = "OffRampAddress";
  /**
   * Sets the crosschain progress for the offramp address.
   *
   * @param crosschainInProgress - The value to set for crosschainInProgress
   * @returns The service instance for method chaining
   */
  public setCrosschainInProgress(
    crosschainInProgress?: (typeof OffRampAddressCrosschainInProgressTypes)[number]
  ) {
    this.data.crosschainInProgress = crosschainInProgress ?? null;
    serviceLog(`Setting crosschainInProgress to ${crosschainInProgress}`);
    return this;
  }

  /**
   * Sets the enabled status for the off-ramp address.
   *
   * @param isEnabled - The value to set for isEnabled
   * @returns The service instance for method chaining
   */
  public setEnabled(isEnabled: boolean) {
    this.data.isEnabled = isEnabled;
    serviceLog(`Setting isEnEbled to ${isEnabled}`);
    return this;
  }
}
