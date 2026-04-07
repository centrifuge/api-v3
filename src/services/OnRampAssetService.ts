import { OnRampAsset, OnRampAssetCrosschainInProgressTypes } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { Service } from "./Service";

/**
 * Service for managing on-ramp assets.
 *
 */
export class OnRampAssetService extends Service<typeof OnRampAsset> {
  static readonly entityTable = OnRampAsset;
  static readonly entityName = "OnRampAsset";
  /**
   * Sets the crosschain progress for the on-ramp asset.
   *
   * @param crosschainInProgress - The value to set; omit to clear
   * @returns The service instance for method chaining
   */
  public setCrosschainInProgress(
    crosschainInProgress?: (typeof OnRampAssetCrosschainInProgressTypes)[number]
  ) {
    this.data.crosschainInProgress = crosschainInProgress ?? null;
    serviceLog(`Setting crosschainInProgress to ${crosschainInProgress}`);
    return this;
  }

  /**
   * Sets the enabled status for the on-ramp asset.
   *
   * @param isEnabled - The value to set for isEnabled
   * @returns The service instance for method chaining
   */
  public setEnabled(isEnabled: boolean) {
    this.data.isEnabled = isEnabled;
    serviceLog(`Setting isEnabled to ${isEnabled}`);
    return this;
  }
}
