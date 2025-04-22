import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { ShareClassService } from "../services";
import { VaultService } from "../services/VaultService";

ponder.on("PoolManager:DeployVault", async ({ event, context }) => {
  logEvent(event, "PoolManager:DeployVault");
  const { poolId, trancheId, asset, tokenId, factory, vault: vaultId } = event.args;
  const vault = await VaultService.getOrInit(context, { id: vaultId, poolId, shareClassId: trancheId, assetId: asset, type: "ASYNC", manager: factory });
  const shareClass = await ShareClassService.getOrInit(context, { id: trancheId, poolId });
});

