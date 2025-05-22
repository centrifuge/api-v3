import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { HoldingService } from "../services";

ponder.on("BalanceSheet:Deposit", async ({ event, context }) => {
  logEvent(event, "BalanceSheet:Deposit");
  const { chainId: _chainId } = context.network;
  const {
    poolId: _poolId,
    scId: _shareClassId,
    asset: _localAssetAddress,
    tokenId: _tokenId,
    provider: _provider,
    amount,
    pricePoolPerAsset,
  } = event.args;
  const poolId = _poolId.toString();
  const shareClassId = _shareClassId.toString();
  const localAssetAddress = _localAssetAddress.toString();
  const provider = _provider.toString();

  const holding = await HoldingService.get(context, { shareClassId });
});

ponder.on("BalanceSheet:Withdraw", async ({ event, context }) => {
  logEvent(event, "BalanceSheet:Withdraw");
  const { chainId: _chainId } = context.network;
  const { poolId, scId, asset, tokenId, receiver, amount, pricePoolPerAsset } =
    event.args;
});
