import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { ShareClassService } from "../services";
import { VaultService } from "../services/VaultService";

ponder.on("PoolManager:DeployVault", async ({ event, context }) => {
  logEvent(event, "PoolManager:DeployVault");
  const { chainId } = context.network;
  const {
    poolId,
    scId,
    asset,
    tokenId,
    factory,
    vault: vaultId,
  } = event.args;
  const vault = (await VaultService.getOrInit(context, {
    id: vaultId.toString(),
    blockchainId: chainId.toString(),
    poolId: poolId.toString(),
    shareClassId: scId.toString(),
    assetId: asset.toString(),
    type: "ASYNC",
    manager: factory,
  })) as VaultService;
  const shareClass = (await ShareClassService.getOrInit(context, {
    id: scId.toString(),
    poolId: poolId.toString(),
  })) as ShareClassService;
});
