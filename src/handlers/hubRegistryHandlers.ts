import { ponder } from "ponder:registry";
import { PoolService } from "../services/PoolService";
import { logEvent } from "../helpers/logger";
import { AssetRegistrationService, getAssetCentrifugeId, PoolManagerService } from "../services";
import { BlockchainService } from "../services/BlockchainService";
import { fetchFromIpfs } from "../helpers/ipfs";

const ipfsHashRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{58})$/

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

ponder.on("HubRegistry:SetMetadata", async ({ event, context }) => {
  logEvent(event, context, "HubRegistry:SetMetadata");
  const chainId = context.chain.id
  if (typeof chainId !== 'number') throw new Error('Chain ID is required')

  const { poolId, metadata: rawMetadata } = event.args;

  const blockchain = await BlockchainService.get(context, { id: chainId.toString() }) as BlockchainService  
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read()

  const pool = await PoolService.getOrInit(context, { id: poolId, centrifugeId }) as PoolService;
  if (!pool) throw new Error("Pool not found");

  let metadata = Buffer.from(rawMetadata.slice(2), "hex").toString("utf-8");
  const isIpfs = ipfsHashRegex.test(metadata)
  if (isIpfs) {
    metadata = `ipfs://${metadata}`
    const ipfsData = await fetchFromIpfs(metadata)
    pool.setName(ipfsData?.pool?.name)
  }

  pool.setMetadata(metadata);
  await pool.save()
})