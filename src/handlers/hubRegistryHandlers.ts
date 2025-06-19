import { ponder } from "ponder:registry";
import { PoolService } from "../services/PoolService";
import { logEvent } from "../helpers/logger";
import { EpochService } from "../services";
import { AssetRegistrationService, AssetService } from "../services";
import { BlockchainService } from "../services/BlockchainService";

ponder.on("HubRegistry:NewPool", async ({ event, context }) => {
  logEvent(event, "HubRegistry:NewPool");
  const chainId = context.chain.id
  if (typeof chainId !== 'number') throw new Error('Chain ID is required')
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
  const chainId = context.chain.id
  if (typeof chainId !== 'number') throw new Error('Chain ID is required')
  
  const { assetId: _assetRegistrationId, decimals } = event.args;

  const blockchain = await BlockchainService.get(context, { id: chainId.toString() }) as BlockchainService
  const { centrifugeId } = blockchain.read()

  const assetRegistrationId = _assetRegistrationId.toString()

  const assetRegistration = (await AssetRegistrationService.getOrInit(context, {
    assetId: assetRegistrationId,
    centrifugeId,
    decimals,
  })) as AssetRegistrationService;

  assetRegistration.setStatus("REGISTERED");
  await assetRegistration.save()
});

function getCentrifugeId(assetId: bigint): string {
  // Perform the right shift by 112 bits
  return Number(assetId >> 112n).toString();
}
