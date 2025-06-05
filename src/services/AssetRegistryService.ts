import type { Context } from "ponder:registry";
import { AssetRegistry } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class AssetRegistryService extends mixinCommonStatics(
  Service<typeof AssetRegistry>,
  AssetRegistry,
  "AssetRegistry"
) {}
