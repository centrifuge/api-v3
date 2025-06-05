import type { Context } from "ponder:registry";
import { AssetRegistration } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class AssetRegistrationService extends mixinCommonStatics(
  Service<typeof AssetRegistration>,
  AssetRegistration,
  "AssetRegistration"
) {}
