import { multiMapper } from "../helpers/multiMapper";
import { logEvent } from "../helpers/logger";
import { HoldingService } from "../services/HoldingService";
import { HoldingAccountService } from "../services/HoldingAccountService";
import { HoldingAccountTypes, HoldingSnapshot } from "ponder:schema";
import { BlockchainService } from "../services/BlockchainService";
import { snapshotter } from "../helpers/snapshotter";

multiMapper("holdings:Initialize", async ({ event, context }) => {
  logEvent(event, context, "Holdings:Create");
  const [_poolId, shareClassId, assetId, _valuation, isLiability, accounts] =
    event.args;
  const poolId = _poolId;
  const tokenId = shareClassId;
  const valuation = _valuation.toString();

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const holding = (await HoldingService.getOrInit(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetId,
  }, event)) as HoldingService;

  await holding.initialize();
  await holding.setValuation(valuation);
  await holding.setIsLiability(isLiability);
  await holding.save(event);

  for (const { accountId: _accountId, kind: _kind } of accounts) {
    const accountId = _accountId.toString();
    const kind = isLiability
      ? HoldingAccountTypes[_kind + 4]
      : HoldingAccountTypes[_kind];
    if (!kind) throw new Error(`Invalid holding account type: ${_kind}`);
    const _holdingAccount = await HoldingAccountService.getOrInit(context, {
      id: accountId,
      kind,
      tokenId,
    }, event);
  }
});

multiMapper("holdings:Increase", async ({ event, context }) => {
  logEvent(event, context, "Holdings:Increase");
  const [_poolId, _scId, assetId, _pricePoolPerAsset, amount, increasedValue] =
    event.args;

  const poolId = _poolId;
  const tokenId = _scId.toString();

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const holding = (await HoldingService.getOrInit(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetId,
  }, event)) as HoldingService;

  await holding.increase(amount, increasedValue);
  await holding.save(event);

  await snapshotter(context, event, "holdingsV3:Increase", [holding], HoldingSnapshot);
});

multiMapper("holdings:Decrease", async ({ event, context }) => {
  logEvent(event, context, "Holdings:Decrease");
  
  const [_poolId, _scId, assetId, _pricePoolPerAsset, amount, decreasedValue] =
    event.args;

  const poolId = _poolId;
  const tokenId = _scId.toString();

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const holding = (await HoldingService.getOrInit(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetId,
  }, event)) as HoldingService;



  await holding.decrease(amount, decreasedValue);
  await holding.save(event);
});

multiMapper("holdings:Update", async ({ event, context }) => {
  logEvent(event, context, "Holdings:Update");
  
  const {
    poolId: _poolId,
    scId: _scId,
    assetId: assetId,
    isPositive,
    diffValue,
  } = event.args;

  
  const poolId = _poolId;
  const tokenId = _scId.toString();

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const holding = (await HoldingService.getOrInit(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetId,
  }, event)) as HoldingService;

  await holding.update(isPositive, diffValue);
  await holding.save(event);

  await snapshotter(context, event, "holdingsV3:Update", [holding], HoldingSnapshot);
});

multiMapper("holdings:UpdateValuation", async ({ event, context }) => {
  logEvent(event, context, "Holdings:UpdateValuation");
  const {
    poolId: _poolId,
    scId: _scId,
    assetId,
    valuation,
  } = event.args;

  const poolId = _poolId;
  const tokenId = _scId.toString();

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const holding = (await HoldingService.getOrInit(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetId,
  }, event)) as HoldingService;

  await holding.setValuation(valuation);
  await holding.save(event);

  await snapshotter(context, event, "holdingsV3:UpdateValuation", [holding], HoldingSnapshot);
});
