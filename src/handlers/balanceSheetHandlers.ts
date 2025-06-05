import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { HoldingService } from "../services";

ponder.on("BalanceSheet:Deposit", async ({ event, context }) => {
  logEvent(event, "BalanceSheet:Deposit");
  const { chainId: _chainId } = context.network;
  const {
    poolId: _poolId,
    scId: _tokenId,
    asset: _assetAddress,
    //tokenId: _tokenId, TODO: Update property name
    provider: _provider,
    amount,
    pricePoolPerAsset,
  } = event.args;
  const poolId = _poolId.toString();
  const tokenId = _tokenId.toString();
  const assetAddress = _assetAddress.toString();
  const provider = _provider.toString();

  //const holding = await HoldingService.get(context, { shareClassId });
});

ponder.on("BalanceSheet:Withdraw", async ({ event, context }) => {
  logEvent(event, "BalanceSheet:Withdraw");
  const { chainId: _chainId } = context.network;
  const { poolId, scId: tokenId, asset, receiver, amount, pricePoolPerAsset } = event.args;
});
