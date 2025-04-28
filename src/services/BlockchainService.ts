import type { Context } from "ponder:registry";
import { Blockchain } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

export class BlockchainService extends mixinCommonStatics(Service<typeof Blockchain>, Blockchain, "Blockchain") {
  public setLastPeriodStart(lastPeriodStart: Date) {
    this.data.lastPeriodStart = lastPeriodStart
    return this
  }
}