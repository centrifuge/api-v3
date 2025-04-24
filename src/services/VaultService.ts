import type { Context } from "ponder:registry";
import { Vault } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class VaultService extends mixinCommonStatics(Service<typeof Vault>, Vault, "Vault") {}