import { Token } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class TokenService extends mixinCommonStatics(Service<typeof Token>, Token, "Token") {}