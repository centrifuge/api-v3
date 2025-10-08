import { ponder } from "ponder:registry";
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

ponder.on("BalanceSheet:NoteDeposit", async ({ event, context }) => {
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

  const asset = (await AssetService.getFirst(context, {
    address: assetAddress,
  })) as AssetService | null;
  if (!asset) throw new Error("Asset not found");
  const { id: assetId } = asset.read();

  const escrow = await EscrowService.getFirst(context, {
    poolId,
    centrifugeId,
  });
  if (!escrow) {
    console.error(`Escrow not found for pool ${poolId} and centrifugeId ${centrifugeId}`);
    return;
  }
  const { address: escrowAddress } = escrow.read();

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
    event.block
  )) as HoldingEscrowService;

  await holdingEscrow.increaseAssetAmount(amount);
  await holdingEscrow.setAssetPrice(pricePoolPerAsset);
  await holdingEscrow.save(event.block);

  await snapshotter(context, event, "BalanceSheet:NoteDeposit", [holdingEscrow], HoldingEscrowSnapshot);
});

ponder.on("BalanceSheet:Withdraw", async ({ event, context }) => {
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

  const asset = (await AssetService.getFirst(context, {
    address: assetAddress,
  })) as AssetService | null;
  if (!asset) throw new Error("Asset not found");
  const { id: assetId } = asset.read();

  const escrow = await EscrowService.getFirst(context, {
    poolId,
    centrifugeId,
  });
  if (!escrow) {
    console.error(`Escrow not found for pool ${poolId} and centrifugeId ${centrifugeId}`);
    return;
  }
  const { address: escrowAddress } = escrow.read();

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
    event.block
  )) as HoldingEscrowService;

  await holdingEscrow.decreaseAssetAmount(amount);
  await holdingEscrow.setAssetPrice(pricePoolPerAsset);
  await holdingEscrow.save(event.block);

  await snapshotter(context, event, "BalanceSheet:Withdraw", [holdingEscrow], HoldingEscrowSnapshot);
});

ponder.on("BalanceSheet:UpdateManager", async ({ event, context }) => {
  logEvent(event, context, "BalanceSheet:UpdateManager");
  
  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const { who: manager, poolId, canManage } = event.args;

  const account = (await AccountService.getOrInit(
    context,
    {
      address: manager,
    },
    event.block
  )) as AccountService;

  const { address: managerAddress } = account.read();

  const poolManager = (await PoolManagerService.getOrInit(
    context,
    {
      address: managerAddress,
      centrifugeId,
      poolId,
    },
    event.block
  )) as PoolManagerService;
  poolManager.setIsBalancesheetManager(canManage);
  await poolManager.save(event.block);
});
