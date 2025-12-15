import { multiMapper } from "../helpers/multiMapper";
import { logEvent } from "../helpers/logger";
import {
  AccountService,
  AssetService,
  BlockchainService,
  EscrowService,
  HoldingEscrowService,
  PoolManagerService,
} from "../services";
import { snapshotter } from "../helpers/snapshotter";
import { HoldingEscrowSnapshot } from "ponder:schema";

multiMapper('balanceSheet:NoteDeposit', async ({ event, context }) => {
  logEvent(event, context, "BalanceSheet:NoteDeposit");
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const {
    poolId,
    scId: tokenId,
    asset: assetAddress,
    amount,
    pricePoolPerAsset,
  } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const assetQuery = (await AssetService.query(context, {
    address: assetAddress,
  })) as AssetService[];
  const asset = assetQuery.pop();
  if (!asset) throw new Error("Asset not found");
  const { id: assetId } = asset.read();

  const escrowQuery = await EscrowService.query(context, {
    poolId,
    centrifugeId,
  });
  if (escrowQuery.length !== 1)
    throw new Error("Expecting 1 escrow for pool and centrifugeId");
  const escrow = escrowQuery.pop();
  const { address: escrowAddress } = escrow!.read();

  const holdingEscrow = (await HoldingEscrowService.getOrInit(
    context,
    {
      centrifugeId,
      poolId,
      tokenId,
      assetAddress,
      assetId,
      escrowAddress,
    },
    event
  )) as HoldingEscrowService;

  await holdingEscrow.increaseAssetAmount(amount);
  await holdingEscrow.setAssetPrice(pricePoolPerAsset);
  await holdingEscrow.save(event);

  await snapshotter(context, event, "balanceSheetV3:NoteDeposit", [holdingEscrow], HoldingEscrowSnapshot);
});

multiMapper("balanceSheet:Withdraw", async ({ event, context }) => {
  logEvent(event, context, "BalanceSheet:Withdraw");
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const {
    poolId,
    scId: tokenId,
    asset: assetAddress,
    amount,
    pricePoolPerAsset,
  } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const assetQuery = (await AssetService.query(context, {
    address: assetAddress,
  })) as AssetService[];

  const asset = assetQuery.pop();
  if (!asset) throw new Error("Asset not found");
  const { id: assetId } = asset.read();

  const escrowQuery = await EscrowService.query(context, {
    poolId,
    centrifugeId,
  });
  if (escrowQuery.length !== 1)
    throw new Error("Expecting 1 escrow for pool and centrifugeId");
  const escrow = escrowQuery.pop();
  const { address: escrowAddress } = escrow!.read();

  const holdingEscrow = (await HoldingEscrowService.getOrInit(
    context,
    {
      centrifugeId,
      poolId,
      tokenId,
      assetAddress,
      assetId,
      escrowAddress,
    },
    event
  )) as HoldingEscrowService;

  await holdingEscrow.decreaseAssetAmount(amount);
  await holdingEscrow.setAssetPrice(pricePoolPerAsset);
  await holdingEscrow.save(event);

  await snapshotter(context, event, "balanceSheetV3:Withdraw", [holdingEscrow], HoldingEscrowSnapshot);
});

multiMapper("balanceSheet:UpdateManager", async ({ event, context }) => {
  logEvent(event, context, "balanceSheet:UpdateManager");
  
  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const { who: manager, poolId, canManage } = event.args;

  const account = (await AccountService.getOrInit(
    context,
    {
      address: manager,
    },
    event
  )) as AccountService;

  const { address: managerAddress } = account.read();

  const poolManager = (await PoolManagerService.getOrInit(
    context,
    {
      address: managerAddress,
      centrifugeId,
      poolId,
    },
    event
  )) as PoolManagerService;
  poolManager.setIsBalancesheetManager(canManage);
  await poolManager.save(event);
});