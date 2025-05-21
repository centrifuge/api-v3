import { LocalToken } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class LocalTokenService extends mixinCommonStatics(Service<typeof LocalToken>, LocalToken, "LocalToken") {}