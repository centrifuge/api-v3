import { ponder } from "ponder:registry";
import { PoolService } from "../services/PoolService";
import { logEvent } from "../helpers/logger";
import { EpochService } from "../services";
import { AssetService } from "../services/AssetService";
import { LocalAssetService } from "../services/LocalAssetService";
import { BN } from "bn.js";
import { BlockchainService } from "../services/BlockchainService";

ponder.on("HubRegistry:NewPool", async ({ event, context }) => {
  logEvent(event, "HubRegistry:NewPool");

  const { chainId } = context.network;
  const { poolId, currency, manager } = event.args;

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
  const { assetId, decimals } = event.args;
  const {} = event.transaction

  const assetCentrifugeId = new BN(assetId.toString()).shrn(112).toString();

  const newAsset = (await AssetService.getOrInit(context, {
    id: assetId.toString(),
    centrifugeId: assetCentrifugeId,
    decimals,
  })) as AssetService;

  const localAsset = (await LocalAssetService.getOrInit(context, {
    assetId: assetId.toString(),
    centrifugeId: assetCentrifugeId,
  })) as LocalAssetService;
  localAsset.setStatus("REGISTERED");
  await localAsset.save()
});
