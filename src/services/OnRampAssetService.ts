import { Service, mixinCommonStatics } from "./Service";
import { OnRampAsset } from "ponder:schema";

/**
 * Service for managing on-ramp assets.
 *
 */
export class OnRampAssetService extends mixinCommonStatics(
  Service<typeof OnRampAsset>,
  OnRampAsset,
  "OnRampAsset"
) {
  /**
   * Enables the on-ramp asset
   *
   * @returns The service instance for method chaining
   */
  public enable() {
    this.data.isEnabled = true;
    return this;
  }

  /**
   * Disables the on-ramp asset
   *
   * @returns The service instance for method chaining
   */
  public disable() {
    this.data.isEnabled = false;
    return this;
  }
}
