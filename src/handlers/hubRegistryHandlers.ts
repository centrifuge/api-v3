import { ponder } from "ponder:registry";
import { PoolService } from "../services/PoolService";
import { logEvent } from "../helpers/logger";
import { EpochService } from "../services";
import { AssetRegistrationService, getAssetCentrifugeId } from "../services";
import { BlockchainService } from "../services/BlockchainService";

ponder.on("HubRegistry:NewPool", async ({ event, context }) => {
  logEvent(event, context, "HubRegistry:NewPool");
  const chainId = context.chain.id
  if (typeof chainId !== 'number') throw new Error('Chain ID is required')
  const { poolId, currency, manager: _manager } = event.args;
  const manager = _manager.toString();
  const blockchain = await BlockchainService.get(context, { id: chainId.toString() }) as BlockchainService
  const { centrifugeId } = blockchain.read()

  const pool = (await PoolService.init(context, {
    id: poolId,
    centrifugeId,
    shareClassManager: manager,
    currency,
    isActive: true,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  })) as PoolService;

  const epoch = (await EpochService.init(context, {
    poolId: poolId,
    index: 1,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  })) as EpochService;
});

ponder.on("HubRegistry:NewAsset", async ({ event, context }) => { //Fires Second to complete
  logEvent(event, context, "HubRegistry:NewAsset");
  const chainId = context.chain.id
  if (typeof chainId !== 'number') throw new Error('Chain ID is required')

  const { assetId, decimals } = event.args;
  const assetCentrifugeId = getAssetCentrifugeId(assetId);

  const blockchain = await BlockchainService.get(context, { id: chainId.toString() }) as BlockchainService
  const { centrifugeId } = blockchain.read()

  const assetRegistration = (await AssetRegistrationService.getOrInit(context, {
    assetId,
    centrifugeId,
    decimals,
  })) as AssetRegistrationService;

  assetRegistration.setAssetCentrifugeId(assetCentrifugeId);
  assetRegistration.setStatus("REGISTERED");
  await assetRegistration.save()
});


