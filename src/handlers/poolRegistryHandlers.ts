import { ponder } from "ponder:registry";
import { PoolService } from "../services/PoolService";
import { ShareClassService } from "../services/ShareClassService";
import { logEvent } from "../helpers/logger";
import { EpochService } from "../services";

ponder.on("PoolRegistry:NewPool", async ({ event, context }) => {
  logEvent(event, "NewPool");
  
  const { poolId, currency, shareClassManager, admin } = event.args;

  const pool = await PoolService.init(context, {
    id: poolId,
    admin,
    shareClassManager,
    currency,
    isActive: true,
  });

  const shareClassIds = await pool.getShareClassIds();
  const shareClassCreator = shareClassIds.map(([index, shareClassId]) => {
    return ShareClassService.init(context, {
      index,
      id: shareClassId,
      poolId,
    });
  });
  const shareClasses = await Promise.all(shareClassCreator);

  const epoch = await EpochService.init(context, {
    poolId,
    epochId: 1,
  });
});