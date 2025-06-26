import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { HoldingService } from "../services/HoldingService";
import { HoldingAccountService } from "../services/HoldingAccountService";
import { HoldingAccountTypes } from "ponder:schema";
import { BlockchainService } from "../services/BlockchainService";

ponder.on("Holdings:Initialize", async ({ event, context }) => {
  logEvent(event, "Holdings:Create");
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const [_poolId, shareClassId, assetRegistrationId, _valuation, isLiability, accounts] =
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
    assetRegistrationId,
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
  logEvent(event, "Holdings:Increase");
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const [_poolId, _scId, assetRegistrationId, pricePoolPerAsset, amount, increasedValue] =
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
    assetRegistrationId,
  })) as HoldingService;

  await holding.increase(amount, increasedValue, pricePoolPerAsset);
  await holding.save();
});

ponder.on("Holdings:Decrease", async ({ event, context }) => {
  logEvent(event, "Holdings:Decrease");
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const [_poolId, _scId, assetRegistrationId, pricePoolPerAsset, amount, decreasedValue] =
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
    assetRegistrationId,
  })) as HoldingService;

  await holding.decrease(amount, decreasedValue, pricePoolPerAsset);
  await holding.save();
});

ponder.on("Holdings:Update", async ({ event, context }) => {
  logEvent(event, "Holdings:Update");
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const {
    poolId: _poolId,
    scId: _scId,
    assetId: assetRegistrationId,
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
    assetRegistrationId,
  })) as HoldingService;

  await holding.update(isPositive, diffValue);
  await holding.save();
});

ponder.on("Holdings:UpdateValuation", async ({ event, context }) => {
  logEvent(event, "Holdings:UpdateValuation");
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const {
    poolId: _poolId,
    scId: _scId,
    assetId: assetRegistrationId,
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
    assetRegistrationId,
  })) as HoldingService;

  await holding.setValuation(valuation);
  await holding.save();
});
