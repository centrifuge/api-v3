import type { Context } from "ponder:registry";
import { LocalAsset } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class LocalAssetService extends mixinCommonStatics(Service<typeof LocalAsset>, LocalAsset, "LocalAsset") {
  public setStatus(status: typeof LocalAsset.$inferSelect['status']) {
    this.data.status = status;
    return this
  }
}