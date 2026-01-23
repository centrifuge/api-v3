import { Service, mixinCommonStatics } from "./Service";
import { OfframpRelayer } from "ponder:schema";

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
   * Enables the off-ramp relayer
   *
   * @returns The service instance for method chaining
   */
  public enable() {
    this.data.isEnabled = true;
    return this;
  }

  /**
   * Disables the off-ramp relayer
   *
   * @returns The service instance for method chaining
   */
  public disable() {
    this.data.isEnabled = false;
    return this;
  }
}
