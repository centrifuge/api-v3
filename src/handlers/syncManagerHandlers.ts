import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceLog } from "../helpers/logger";
import { AssetService, BlockchainService, TokenInstanceService, VaultService } from "../services";

multiMapper("syncManager:SetMaxReserve", async ({ event, context }) => {
  logEvent(event, context, "syncManager:SetMaxReserve");
  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const {
    poolId,
    scId: tokenId,
    asset: assetAddress,
    tokenId: assetTokenId,
    maxReserve,
  } = event.args;

  const asset = await AssetService.getByToken(context, {
    centrifugeId,
    address: assetAddress,
    assetTokenId,
  });
  if (!asset)
    return serviceLog(
      `Asset not found for SetMaxReserve (centrifugeId=${centrifugeId}, address=${assetAddress}, assetTokenId=${assetTokenId}). Maybe not registered yet?`
    );
  const { id: assetId } = asset.read();

  const vault = (await VaultService.get(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetId,
  })) as VaultService | null;
  if (!vault)
    return serviceLog(`Vault not found. Cannot retrieve vault. Maybe it's not deployed yet?`);

  await vault.setMaxReserve(maxReserve).setCrosschainInProgress().save(event);
});

multiMapper("syncManager:SetValuation", async ({ event, context }) => {
  logEvent(event, context, "syncManager:SetValuation");
  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const { scId: tokenId } = event.args;

  const tokenInstance = (await TokenInstanceService.get(context, {
    centrifugeId,
    tokenId,
  })) as TokenInstanceService | null;
  if (!tokenInstance) {
    return serviceLog(
      `TokenInstance not found for SetValuation (centrifugeId=${centrifugeId}, tokenId=${tokenId}). Maybe not indexed yet?`
    );
  }

  await tokenInstance.setCrosschainInProgress().save(event);
});
