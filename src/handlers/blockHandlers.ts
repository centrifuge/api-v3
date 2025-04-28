import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { Timekeeper } from "../helpers/timekeeper";
import { PoolService } from "../services";
import { PoolSnapshot } from "ponder:schema";
import { snapshotter } from "../helpers/snapshotter";
const timekeeper = Timekeeper.start()

ponder.on("sepolia:block", async ({ event, context }) => {
  const newPeriod = await timekeeper.processBlock(context, event)
  if (!newPeriod) return
  
  const pools = await PoolService.query(context, {
    isActive: true,
  }) as PoolService[];

  logEvent(event, "sepolia:newPeriod")
  
  await snapshotter(context, event, pools, PoolSnapshot)
  
  await timekeeper.update(context)
});
