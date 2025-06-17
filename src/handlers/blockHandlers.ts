import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { Timekeeper } from "../helpers/timekeeper";
import { PoolService } from "../services";
import { PoolSnapshot } from "ponder:schema";
import { snapshotter } from "../helpers/snapshotter";
import { currentChains } from "../../ponder.config";

const timekeeper = Timekeeper.start()

async function processBlock(args: Parameters<Parameters<typeof ponder.on>[1]>[0]) {
  const chainName  = args.context.chain.name
  const { event, context } = args
  const newPeriod = await timekeeper.processBlock(context, event)
  if (!newPeriod) return
  logEvent(event, `${chainName}:newPeriod`)
  
  const pools = await PoolService.query(context, {
    isActive: true,
  }) as PoolService[];
}

currentChains.forEach(chain => {
  ponder.on(`${chain.network.network}:block`, processBlock);
})
