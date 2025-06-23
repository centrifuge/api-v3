import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { BlockchainService, HoldingService, TokenInstanceService } from "../services";

ponder.on("BalanceSheet:Deposit", async ({ event, context }) => {
  logEvent(event, "BalanceSheet:Deposit");
  const _chainId = context.chain.id as number
  const {
    poolId: _poolId,
    scId: _tokenId,
    asset: _assetAddress,
    //tokenId: _tokenId, TODO: Update property name
    amount,
  } = event.args;
  const poolId = _poolId;
  const tokenId = _tokenId.toString();
  const assetAddress = _assetAddress.toString();

  //const holding = await HoldingService.get(context, { shareClassId });
});

ponder.on("BalanceSheet:Withdraw", async ({ event, context }) => {
  logEvent(event, "BalanceSheet:Withdraw");
  const _chainId = context.chain.id as number
  const {
    poolId,
    scId: tokenId,
    asset,
    receiver,
    amount,
    pricePoolPerAsset,
  } = event.args;
});

ponder.on("BalanceSheet:Issue", async ({ event, context }) => {
  logEvent(event, "BalanceSheet:Issue");
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
  logEvent(event, "BalanceSheet:Revoke");
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