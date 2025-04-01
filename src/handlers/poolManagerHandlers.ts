import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { ShareClassService } from "../services";

ponder.on("PoolManager:DeployVault", async ({ event, context }) => {
  logEvent(event, "PoolManager:DeployVault");
  const { poolId, trancheId, asset, tokenId, factory, vault } = event.args;
  const shareClass = await ShareClassService.getOrInit(context, { id: trancheId, poolId });
  await shareClass.setVault(vault);
  await shareClass.save();
});

