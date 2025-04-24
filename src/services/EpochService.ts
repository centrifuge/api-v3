import type { Context, Event } from "ponder:registry";
import { Epoch } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";



export class EpochService extends mixinCommonStatics(Service<typeof Epoch>, Epoch, "Epoch") {
  close(context: Context, block: Event["block"]) {
    console.info(
      `Closing epoch ${this.data.poolId} ${this.data.index} at block ${block.number}`
    );
    this.data.closedAtBlock = Number(block.number);
    this.data.closedAt = new Date(Number(block.timestamp) * 1000);
    return this;
  }
}