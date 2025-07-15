import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { AssetRegistrationService, AssetService, BlockchainService, EscrowService, HoldingEscrowService, TokenInstanceService } from "../services";

ponder.on("BalanceSheet:Issue", async ({ event, context }) => {
  logEvent(event, context, "BalanceSheet:Issue");
  const _chainId = context.chain.id as number
  const chainId = _chainId.toString();
  const {
    poolId: _poolId,
    scId: _tokenId,
    to: _receiver,
    //pricePerShare,
    shares,
  } = event.args;
  const poolId = _poolId;
  const tokenId = _tokenId.toString();
  const receiver = _receiver.toString();

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
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
    scId: _tokenId,
    from: _sender,
    shares,
  } = event.args;
  const poolId = _poolId;
  const tokenId = _tokenId.toString();
  const sender = _sender.toString();

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
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
  const { centrifugeId } = blockchain.read();

  const asset = await AssetService.get(context, {address: assetAddress}) as AssetService;
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
  const { centrifugeId } = blockchain.read();

  const assetRegistrationQuery = await AssetRegistrationService.query(context, {
    assetAddress,
  }) as AssetRegistrationService[];

  const assetRegistration = assetRegistrationQuery.pop();
  if (!assetRegistration) throw new Error("AssetRegistration not found for asset");
  const { id: assetId } = assetRegistration.read();

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