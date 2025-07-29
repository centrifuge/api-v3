import { Service, mixinCommonStatics } from "./Service";
import { OfframpRelayer } from "ponder:schema";

/**
 * Service for managing off-ramp relayers.
 *
 */
export class OffRampRelayerService extends mixinCommonStatics(Service<typeof OfframpRelayer>, OfframpRelayer, "OffRampRelayer") {
  /**
   * Sets the enabled status of the off-ramp relayer.
   *
   * @param isEnabled - The new enabled status
   * @returns The service instance for method chaining
   */
  public setEnabled(isEnabled: boolean) {
    this.data.isEnabled = isEnabled;
    return this;
  }
}