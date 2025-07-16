import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { HoldingService } from "../services/HoldingService";
import { HoldingAccountService } from "../services/HoldingAccountService";
import { HoldingAccountTypes, HoldingSnapshot } from "ponder:schema";
import { BlockchainService } from "../services/BlockchainService";
import { snapshotter } from "../helpers/snapshotter";

ponder.on("Holdings:Initialize", async ({ event, context }) => {
  logEvent(event, context, "Holdings:Create");
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const [_poolId, shareClassId, assetId, _valuation, isLiability, accounts] =
    event.args;
  const chainId = _chainId.toString();
  const poolId = _poolId;
  const tokenId = shareClassId;
  const valuation = _valuation.toString();

  const blockchain = (await BlockchainService.get(context, {
    id: chainId,
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  const holding = (await HoldingService.getOrInit(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetId,
  })) as HoldingService;

  await holding.initialize();
  await holding.setValuation(valuation);
  await holding.setIsLiability(isLiability);
  await holding.save();

  for (const { accountId: _accountId, kind: _kind } of accounts) {
    const accountId = _accountId.toString();
    const kind = isLiability
      ? HoldingAccountTypes[_kind + 4]
      : HoldingAccountTypes[_kind];
    if (!kind) throw new Error(`Invalid holding account type: ${_kind}`);
    const holdingAccount = await HoldingAccountService.getOrInit(context, {
      id: accountId,
      kind,
      tokenId,
    });
  }
});

ponder.on("Holdings:Increase", async ({ event, context }) => {
  logEvent(event, context, "Holdings:Increase");
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const [_poolId, _scId, assetId, pricePoolPerAsset, amount, increasedValue] =
    event.args;

  const chainId = _chainId.toString();
  const poolId = _poolId;
  const tokenId = _scId.toString();

  const blockchain = (await BlockchainService.get(context, {
    id: chainId,
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  const holding = (await HoldingService.getOrInit(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetId,
  })) as HoldingService;

  await holding.increase(amount, increasedValue, pricePoolPerAsset);
  await holding.save();

  await snapshotter(context, event, "Holdings:Increase", [holding], HoldingSnapshot);
});

ponder.on("Holdings:Decrease", async ({ event, context }) => {
  logEvent(event, context, "Holdings:Decrease");
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const [_poolId, _scId, assetId, pricePoolPerAsset, amount, decreasedValue] =
    event.args;

  const chainId = _chainId.toString();
  const poolId = _poolId;
  const tokenId = _scId.toString();

  const blockchain = (await BlockchainService.get(context, {
    id: chainId,
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  const holding = (await HoldingService.getOrInit(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetId,
  })) as HoldingService;



  await holding.decrease(amount, decreasedValue, pricePoolPerAsset);
  await holding.save();
});

ponder.on("Holdings:Update", async ({ event, context }) => {
  logEvent(event, context, "Holdings:Update");
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const {
    poolId: _poolId,
    scId: _scId,
    assetId: assetId,
    isPositive,
    diffValue,
  } = event.args;

  const chainId = _chainId.toString();
  const poolId = _poolId;
  const tokenId = _scId.toString();

  const blockchain = (await BlockchainService.get(context, {
    id: chainId,
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  const holding = (await HoldingService.getOrInit(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetId,
  })) as HoldingService;

  await holding.update(isPositive, diffValue);
  await holding.save();

  await snapshotter(context, event, "Holdings:Update", [holding], HoldingSnapshot);
});

ponder.on("Holdings:UpdateValuation", async ({ event, context }) => {
  logEvent(event, context, "Holdings:UpdateValuation");
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const {
    poolId: _poolId,
    scId: _scId,
    assetId,
    valuation,
  } = event.args;

  const chainId = _chainId.toString();
  const poolId = _poolId;
  const tokenId = _scId.toString();

  const blockchain = (await BlockchainService.get(context, {
    id: chainId,
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  const holding = (await HoldingService.getOrInit(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetId,
  })) as HoldingService;

  await holding.setValuation(valuation);
  await holding.save();

  await snapshotter(context, event, "Holdings:UpdateValuation", [holding], HoldingSnapshot);
});
