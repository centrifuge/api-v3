import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { HoldingService } from "../services/HoldingService";
import { HoldingAccountService } from "../services/HoldingAccountService";
import { HoldingAccountTypes } from "ponder:schema";

ponder.on("Holdings:Initialize", async ({ event, context }) => {
  logEvent(event, "Holdings:Create");
  const { chainId: _chainId } = context.network;
  const [_poolId, _shareClassId, _assetId, _valuation, isLiability, accounts] =
    event.args;
  const poolId = _poolId.toString();
  const shareClassId = _shareClassId.toString();
  const assetId = _assetId.toString();
  const valuation = _valuation.toString();

  const holding = await HoldingService.init(context, {
    poolId,
    shareClassId,
    assetId,
    valuation,
    isLiability,
  });

  for (const { accountId: _accountId, kind: _kind } of accounts) {
    const accountId = _accountId.toString();
    const kind = isLiability
      ?  HoldingAccountTypes[_kind + 4]
      : HoldingAccountTypes[_kind];
    if (!kind) throw new Error(`Invalid holding account type: ${_kind}`);
    const holdingAccount = await HoldingAccountService.getOrInit(context, {
      id: accountId,
      kind,
      shareClassId,
    });
  }
});

ponder.on("Holdings:Increase", async ({ event, context }) => {
  logEvent(event, "Holdings:Increase");
  const { chainId: _chainId } = context.network;
  const [_poolId, _scId, _assetId, pricePoolPerAsset, amount, increasedValue] =
    event.args;

  const poolId = _poolId.toString();
  const shareClassId = _scId.toString();
  const assetId = _assetId.toString();

  const holding = await HoldingService.get(context, {
    poolId,
    shareClassId,
    assetId,
  }) as HoldingService;

  await holding.increase(amount, increasedValue, pricePoolPerAsset);
  await holding.save();
});

ponder.on("Holdings:Decrease", async ({ event, context }) => {
  logEvent(event, "Holdings:Decrease");
  const { chainId: _chainId } = context.network;
  const [_poolId, _scId, _assetId, pricePoolPerAsset, amount, decreasedValue] =
    event.args;

  const poolId = _poolId.toString();
  const shareClassId = _scId.toString();
  const assetId = _assetId.toString();

  const holding = await HoldingService.get(context, {
    poolId,
    shareClassId,
    assetId,
  }) as HoldingService;

  await holding.decrease(amount, decreasedValue, pricePoolPerAsset);
  await holding.save();
});

ponder.on("Holdings:Update", async ({ event, context }) => {
  logEvent(event, "Holdings:Update");
  const { chainId: _chainId } = context.network;
  const [_poolId, _scId, _assetId, isPositive, diffValue] =
    event.args;

  const poolId = _poolId.toString();
  const shareClassId = _scId.toString();
  const assetId = _assetId.toString();

  const holding = await HoldingService.get(context, {
    poolId,
    shareClassId,
    assetId,
  }) as HoldingService;

  await holding.update(isPositive, diffValue);
  await holding.save();
})
