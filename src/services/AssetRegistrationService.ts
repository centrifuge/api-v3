import type { Context } from "ponder:registry";
import { AssetRegistration } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class AssetRegistrationService extends mixinCommonStatics(
  Service<typeof AssetRegistration>,
  AssetRegistration,
  "AssetRegistration"
) {
  public setStatus(status: typeof AssetRegistration.$inferSelect['status']) {
    this.data.status = status;
    return this
  }

  public setAssetCentrifugeId(assetCentrifugeId: typeof AssetRegistration.$inferSelect['assetCentrifugeId']) {
    this.data.assetCentrifugeId = assetCentrifugeId;
    return this
  }
}

export function getAssetCentrifugeId(assetId: bigint): string | null {
  // Perform the right shift by 112 bits
  const centrifugeId = assetId >> 112n;
  return centrifugeId === 0n ? null : centrifugeId.toString();
}
