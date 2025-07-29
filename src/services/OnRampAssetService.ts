import { Service, mixinCommonStatics } from "./Service";
import { OnRampAsset } from "ponder:schema";

/**
 * Service for managing on-ramp assets.
 *
 */
export class OnRampAssetService extends mixinCommonStatics(Service<typeof OnRampAsset>, OnRampAsset, "OnRampAsset") {}