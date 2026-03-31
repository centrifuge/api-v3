import { OfframpRelayer, OfframpRelayerCrosschainInProgressTypes } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service for managing off-ramp relayers.
 *
 */
export class OffRampRelayerService extends mixinCommonStatics(
  Service<typeof OfframpRelayer>,
  OfframpRelayer,
  "OffRampRelayer"
) {
  /**
   * Sets the crosschain progress for the offramp relayer.
   *
   * @param crosschainInProgress - The value to set; omit to clear
   * @returns The service instance for method chaining
   */
  public setCrosschainInProgress(
    crosschainInProgress?: (typeof OfframpRelayerCrosschainInProgressTypes)[number]
  ) {
    this.data.crosschainInProgress = crosschainInProgress ?? null;
    serviceLog(`Setting crosschainInProgress to ${crosschainInProgress}`);
    return this;
  }

  /**
   * Sets the enabled status for the off-ramp relayer.
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
