import type { Context } from "ponder:registry";
import { Vault } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { VaultStatuses } from "ponder:schema";

export class VaultService extends mixinCommonStatics(Service<typeof Vault>, Vault, "Vault") {
  public setStatus(status: (typeof VaultStatuses)[number]) {
    this.data.status = status;
    return this
  }
}