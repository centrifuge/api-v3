import type { Context } from "ponder:registry";
import { Asset } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class AssetService extends mixinCommonStatics(Service<typeof Asset>, Asset, "Asset") {
  public setStatus(status: typeof Asset.$inferSelect['status']) {
    this.data.status = status;
    return this
  }
}