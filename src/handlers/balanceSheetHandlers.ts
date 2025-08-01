import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { AssetService, BlockchainService, EscrowService, HoldingEscrowService, PoolManagerService, TokenInstanceService } from "../services";

ponder.on("BalanceSheet:Issue", async ({ event, context }) => {
  logEvent(event, context, "BalanceSheet:Issue");
  const _chainId = context.chain.id as number
  const chainId = _chainId.toString();
  const {
    poolId: _poolId,
    scId: tokenId,
    to: _receiver,
    //pricePerShare,
    shares,
  } = event.args;

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

  const tokenInstance = (await TokenInstanceService.get(context, {
    tokenId,
    centrifugeId,
  })) as TokenInstanceService;
  if (!tokenInstance) throw new Error("TokenInstance not found for share class");
  
  await tokenInstance.increaseTotalIssuance(shares);
  await tokenInstance.save();
});

ponder.on("BalanceSheet:Revoke", async ({ event, context }) => {
  logEvent(event, context, "BalanceSheet:Revoke");
  const _chainId = context.chain.id as number
  const chainId = _chainId.toString();
  const {
    poolId: _poolId,
    scId: tokenId,
    from: _sender,
    shares,
  } = event.args;

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read(); 

  const tokenInstance = (await TokenInstanceService.get(context, {
    tokenId,
    centrifugeId,
  })) as TokenInstanceService;
  if (!tokenInstance) throw new Error("TokenInstance not found for share class");

  await tokenInstance.decreaseTotalIssuance(shares);
  await tokenInstance.save();
});

ponder.on("BalanceSheet:NoteDeposit", async ({ event, context }) => {
  logEvent(event, context, "BalanceSheet:NoteDeposit");
  const _chainId = context.chain.id
  if (typeof _chainId !== 'number') throw new Error('Chain ID is required')
  const {
    poolId,
    scId: tokenId,
    asset: assetAddress,
    amount,
    pricePoolPerAsset,
  } = event.args;

  const chainId = _chainId.toString();
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

  const assetQuery = await AssetService.query(context, {address: assetAddress}) as AssetService[];
  const asset = assetQuery.pop();
  if (!asset) throw new Error("Asset not found");
  const { id: assetId } = asset.read();


  const escrowQuery = await EscrowService.query(context, { poolId, centrifugeId })
  if (escrowQuery.length !== 1) throw new Error("Expecting 1 escrow for pool and centrifugeId");
  const escrow = escrowQuery.pop();
  const { address: escrowAddress } = escrow!.read();

  const holdingEscrow = await HoldingEscrowService.getOrInit(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetAddress,
    assetId,
    escrowAddress,
  }) as HoldingEscrowService;

  await holdingEscrow.increaseAssetAmount(amount);
  await holdingEscrow.setAssetPrice(pricePoolPerAsset);
  await holdingEscrow.save();
});

ponder.on("BalanceSheet:Withdraw", async ({ event, context }) => {
  logEvent(event, context, "BalanceSheet:Withdraw");
  const _chainId = context.chain.id
  if (typeof _chainId !== 'number') throw new Error('Chain ID is required')
  const {
    poolId,
    scId: tokenId,
    asset: assetAddress,
    amount,
    pricePoolPerAsset,
  } = event.args;

  const chainId = _chainId.toString();
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

  const assetQuery = await AssetService.query(context, {
    address: assetAddress,
  }) as AssetService[];

  const asset = assetQuery.pop();
  if (!asset) throw new Error("Asset not found");
  const { id: assetId } = asset.read();

  const escrowQuery = await EscrowService.query(context, { poolId, centrifugeId })
  if (escrowQuery.length !== 1) throw new Error("Expecting 1 escrow for pool and centrifugeId");
  const escrow = escrowQuery.pop();
  const { address: escrowAddress } = escrow!.read();

  const holdingEscrow = await HoldingEscrowService.getOrInit(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetAddress,
    assetId,
    escrowAddress,
  }) as HoldingEscrowService;

  await holdingEscrow.decreaseAssetAmount(amount);
  await holdingEscrow.setAssetPrice(pricePoolPerAsset);
  await holdingEscrow.save();
})

ponder.on("BalanceSheet:UpdateManager", async ({ event, context }) => {
  logEvent(event, context, "BalanceSheet:UpdateManager");
  const chainId = context.chain.id
  if (typeof chainId !== 'number') throw new Error('Chain ID is required')

  const blockchain = await BlockchainService.get(context, { id: chainId.toString() }) as BlockchainService
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

  const { who: manager, poolId, canManage } = event.args;
  const poolManager = await PoolManagerService.getOrInit(context, {
    address: manager.substring(0, 42) as `0x${string}`,
    centrifugeId,
    poolId,
  }) as PoolManagerService;
  poolManager.setIsBalancesheetManager(canManage);
  await poolManager.save();
})