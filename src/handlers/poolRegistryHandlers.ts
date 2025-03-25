import { ponder } from "ponder:registry";
import { PoolService } from "../services/PoolService";
import { ShareClassService } from "../services/ShareClassService";
import { logEvent } from "../helpers/logger";

ponder.on("PoolRegistry:NewPool", async ({ event, context }) => {
  logEvent(event);
  
  const { poolId, currency, shareClassManager, admin } = event.args;

  const pool = await PoolService.create(context, {
    id: poolId,
    admin,
    shareClassManager,
    currency,
    isActive: true,
  });

  const shareClassIds = await pool.getShareClassIds();
  const shareClassCreator = shareClassIds.map(([index, shareClassId]) => {
    return ShareClassService.create(context, {
      index,
      id: shareClassId,
      poolId,
    });
  });
  
  await Promise.all(shareClassCreator);
});