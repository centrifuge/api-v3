import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { HoldingService } from "../services/HoldingService";
import { HoldingAccountService } from "../services/HoldingAccountService";
import { HoldingAccountTypes } from "ponder:schema";

ponder.on("Holdings:Initialize", async ({ event, context }) => {
  logEvent(event, "Holdings:Create");
  const _chainId = context.chain.id as number;
  const [_poolId, _shareClassId, _assetId, _valuation, isLiability, accounts] =
    event.args;
  const poolId = _poolId;
  const tokenId = _shareClassId.toString();
  const assetId = _assetId.toString();
  const valuation = _valuation.toString();

  const holding = await HoldingService.getOrInit(context, {
    poolId,
    tokenId,
    assetId,
  }) as HoldingService

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
  const _chainId = context.chain.id
  if (typeof _chainId !== 'number') throw new Error('Chain ID is required')
  const [_poolId, _scId, _assetId, pricePoolPerAsset, amount, increasedValue] =
    event.args;

  const chainId = _chainId.toString();
  const poolId = _poolId;
  const tokenId = _scId.toString();
  const assetId = _assetId.toString();

  const holding = (await HoldingService.getOrInit(context, {
    poolId,
    tokenId,
    assetId,
  })) as HoldingService;

  await holding.increase(amount, increasedValue, pricePoolPerAsset);
  await holding.save();
});

ponder.on("Holdings:Decrease", async ({ event, context }) => {
  logEvent(event, "Holdings:Decrease");
  const _chainId = context.chain.id
  if (typeof _chainId !== 'number') throw new Error('Chain ID is required')
  const [_poolId, _scId, _assetId, pricePoolPerAsset, amount, decreasedValue] =
    event.args;

  const chainId = _chainId.toString();
  const poolId = _poolId;
  const tokenId = _scId.toString();
  const assetId = _assetId.toString();

  const holding = (await HoldingService.getOrInit(context, {
    poolId,
    tokenId,
    assetId,
  })) as HoldingService;

  await holding.decrease(amount, decreasedValue, pricePoolPerAsset);
  await holding.save();
});

ponder.on("Holdings:Update", async ({ event, context }) => {
  logEvent(event, "Holdings:Update");
  const _chainId = context.chain.id
  if (typeof _chainId !== 'number') throw new Error('Chain ID is required')
  const {
    poolId: _poolId,
    scId: _scId,
    assetId: _assetId,
    isPositive,
    diffValue,
  } = event.args;

  const chainId = _chainId.toString();
  const poolId = _poolId;
  const tokenId = _scId.toString();
  const assetId = _assetId.toString();

  const holding = (await HoldingService.getOrInit(context, {
    poolId,
    tokenId,
    assetId,
  })) as HoldingService;

  await holding.update(isPositive, diffValue);
  await holding.save();
});
