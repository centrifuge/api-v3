import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { VaultService } from "../services/VaultService";
import { AssetService } from "../services/AssetService";
import { LocalAssetService } from "../services/LocalAssetService";
import { VaultTypes } from "ponder:schema";
import { BlockchainService } from "../services/BlockchainService";

ponder.on("PoolManager:DeployVault", async ({ event, context }) => {
  logEvent(event, "PoolManager:DeployVault");
  const { chainId } = context.network;
  const { poolId, scId, asset, tokenId, factory, vault: vaultId, kind } = event.args;
  const vaultType = VaultTypes[kind];
  if (!vaultType) throw new Error("Invalid vault type");

  const blockchain = await BlockchainService.get(context, { id: chainId.toString() }) as BlockchainService
  const { centrifugeId } = blockchain.read()

  const vault = (await VaultService.init(context, {
    id: vaultId.toString(),
    centrifugeId,
    poolId: poolId.toString(),
    shareClassId: scId.toString(),
    localAssetId: asset.toString(),
    factory: factory,
    type: vaultType,
  })) as VaultService;
});

ponder.on("PoolManager:RegisterAsset", async ({ event, context }) => { //Fires first to request registration to HUB
  logEvent(event, "PoolManager:RegisterAsset");
  const { chainId } = context.network;
  const { assetId, asset, tokenId, name, symbol, decimals } = event.args;

  const blockchain = await BlockchainService.get(context, { id: chainId.toString() }) as BlockchainService
  const { centrifugeId } = blockchain.read()

  const globalAsset = (await AssetService.getOrInit(context, {
    id: assetId.toString(),
    centrifugeId,
    decimals: decimals,
    tokenId: tokenId,
    name: name,
    symbol: symbol,
  })) as AssetService;

  const { id } = globalAsset.read();

  const localAsset = (await LocalAssetService.getOrInit(context, {
    assetId: id,
    centrifugeId,
    name: name,
    symbol: symbol,
    address: asset,
  })) as LocalAssetService;

  const { status } = localAsset.read();

  if (!status) {
    localAsset.setStatus("IN_PROGRESS");
    await localAsset.save();
  }
});
