import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { HoldingService } from "../services/HoldingService";
import { HoldingAccountService } from "../services/HoldingAccountService";
import { HoldingAccountTypes } from "ponder:schema";

ponder.on("Holdings:Create", async ({ event, context }) => {
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
    const kind = HoldingAccountTypes[_kind];
    if (!kind) throw new Error(`Invalid holding account type: ${_kind}`);
    const holdingAccount = await HoldingAccountService.init(context, {
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
});

ponder.on("Holdings:Decrease", async ({ event, context }) => {
  logEvent(event, "Holdings:Decrease");
  const { chainId: _chainId } = context.network;
  const [_poolId, _scId, _assetId, pricePoolPerAsset, amount, decreasedValue] =
    event.args;
});
