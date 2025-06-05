import { ponder } from "ponder:registry";
import { PoolService } from "../services/PoolService";
import { logEvent } from "../helpers/logger";
import { EpochService } from "../services";
import { AssetRegistryService, AssetService } from "../services";
import { BN } from "bn.js";
import { BlockchainService } from "../services/BlockchainService";

ponder.on("HubRegistry:NewPool", async ({ event, context }) => {
  logEvent(event, "HubRegistry:NewPool");

  const { chainId } = context.network;
  const { poolId, currency, manager: _manager } = event.args;
  const manager = _manager.toString();
  const blockchain = await BlockchainService.get(context, { id: chainId.toString() }) as BlockchainService
  const { centrifugeId } = blockchain.read()

  const pool = (await PoolService.init(context, {
    id: poolId.toString(),
    centrifugeId,
    shareClassManager: manager,
    currency,
    isActive: true,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  })) as PoolService;

  const epoch = (await EpochService.init(context, {
    poolId: poolId.toString(),
    index: 1,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  })) as EpochService;
});

ponder.on("HubRegistry:NewAsset", async ({ event, context }) => { //Fires Second to complete
  logEvent(event, "HubRegistry:NewAsset");
  const { chainId } = context.network;
  const { assetId: _assetRegistryId, decimals } = event.args;
  const {} = event.transaction
  const assetRegistryId = _assetRegistryId.toString();

  const assetCentrifugeId = new BN(assetRegistryId.toString()).shrn(112).toString();

  const newAssetRegistry = (await AssetRegistryService.getOrInit(context, {
    id: assetRegistryId,
    centrifugeId: assetCentrifugeId,
    decimals,
  })) as AssetRegistryService;

  const asset = (await AssetService.getOrInit(context, {
    assetRegistryId,
    centrifugeId: assetCentrifugeId,
  })) as AssetService;
  asset.setStatus("REGISTERED");
  await asset.save()
});
