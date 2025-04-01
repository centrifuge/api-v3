import { ponder } from "ponder:registry";
import { PoolService } from "../services/PoolService";
import { ShareClassService } from "../services/ShareClassService";
import { logEvent } from "../helpers/logger";
import { EpochService } from "../services";

ponder.on("PoolRegistry:NewPool", async ({ event, context }) => {
  logEvent(event, "PoolRegistry:NewPool");
  
  const { poolId, currency, shareClassManager, admin } = event.args;

  const pool = await PoolService.init(context, {
    id: poolId,
    admin,
    shareClassManager,
    currency,
    isActive: true,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  });

  const shareClassIds = await pool.getShareClassIds();
  const shareClassCreator = shareClassIds.map(([index, shareClassId]) => {
    return ShareClassService.init(context, {
      id: shareClassId,
      index,
      poolId,
    });
  });
  if(shareClassIds.length === 0) console.error("No share classes to initialise");
  const shareClasses = await Promise.all(shareClassCreator);
  const epoch = await EpochService.init(context, {
    poolId,
    index: 1,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  });
});