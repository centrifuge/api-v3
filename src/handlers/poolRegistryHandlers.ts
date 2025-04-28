import { ponder } from "ponder:registry";
import { PoolService } from "../services/PoolService";
import { logEvent } from "../helpers/logger";
import { EpochService } from "../services";

ponder.on("PoolRegistry:NewPool", async ({ event, context }) => {
  logEvent(event, "PoolRegistry:NewPool");
  
  const { poolId, currency, shareClassManager, admin } = event.args;

  const pool = await PoolService.init(context, {
    id: poolId.toString(),
    admin,
    shareClassManager,
    currency,
    isActive: true,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  }) as PoolService;
  
  const epoch = await EpochService.init(context, {
    poolId: poolId.toString(),
    index: 1,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  }) as EpochService;
});