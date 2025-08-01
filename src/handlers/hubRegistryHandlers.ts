import { ponder } from "ponder:registry";
import { PoolService } from "../services/PoolService";
import { logEvent } from "../helpers/logger";
import { AssetRegistrationService, getAssetCentrifugeId, PoolManagerService } from "../services";
import { BlockchainService } from "../services/BlockchainService";

ponder.on("HubRegistry:NewPool", async ({ event, context }) => {
  logEvent(event, context, "HubRegistry:NewPool");
  const chainId = context.chain.id
  if (typeof chainId !== 'number') throw new Error('Chain ID is required')
  const { poolId, currency, manager: _manager } = event.args;
  const manager = _manager.toString();
  const blockchain = await BlockchainService.get(context, { id: chainId.toString() }) as BlockchainService
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read()

  const _pool = (await PoolService.init(context, {
    id: poolId,
    centrifugeId,
    shareClassManager: manager,
    currency,
    isActive: true,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  })) as PoolService;
})

ponder.on("HubRegistry:NewAsset", async ({ event, context }) => { //Fires Second to complete
  logEvent(event, context, "HubRegistry:NewAsset");
  const chainId = context.chain.id
  if (typeof chainId !== 'number') throw new Error('Chain ID is required')

  const { assetId, decimals } = event.args;
  const assetCentrifugeId = getAssetCentrifugeId(assetId);

  const blockchain = await BlockchainService.get(context, { id: chainId.toString() }) as BlockchainService
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read()

  const assetRegistration = (await AssetRegistrationService.getOrInit(context, {
    assetId,
    centrifugeId,
    decimals,
  })) as AssetRegistrationService;

  assetRegistration.setAssetCentrifugeId(assetCentrifugeId);
  assetRegistration.setStatus("REGISTERED");
  await assetRegistration.save()
})

ponder.on("HubRegistry:UpdateManager", async ({ event, context }) => {
  logEvent(event, context, "HubRegistry:UpdateManager");
  const chainId = context.chain.id
  if (typeof chainId !== 'number') throw new Error('Chain ID is required')

  const blockchain = await BlockchainService.get(context, { id: chainId.toString() }) as BlockchainService
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read()

  const { manager, poolId, canManage } = event.args;
  
  const poolManager = await PoolManagerService.getOrInit(context, {
    centrifugeId,
    poolId,
    address: manager.substring(0, 42) as `0x${string}`,
  }) as PoolManagerService;
  poolManager.setIsHubManager(canManage);
  await poolManager.save()
})