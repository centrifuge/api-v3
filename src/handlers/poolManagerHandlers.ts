import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { ShareClassService } from "../services";
import { VaultService } from "../services/VaultService";

ponder.on("PoolManager:DeployVault", async ({ event, context }) => {
  logEvent(event, "PoolManager:DeployVault");
  const { poolId, trancheId, asset, tokenId, factory, vault: vaultId } = event.args;
  const vault = await VaultService.getOrInit(context, { id: vaultId.toString(), poolId: poolId.toString(), shareClassId: trancheId.toString(), assetId: asset.toString(), type: "ASYNC", manager: factory }) as VaultService;
  const shareClass = await ShareClassService.getOrInit(context, { id: trancheId.toString(), poolId: poolId.toString() }) as ShareClassService;
});

