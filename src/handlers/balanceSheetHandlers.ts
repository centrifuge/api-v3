import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError } from "../helpers/logger";
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

multiMapper("balanceSheet:NoteDeposit", async ({ event, context }) => {
  logEvent(event, context, "balanceSheet:NoteDeposit");
  const { poolId, scId: tokenId, asset: assetAddress, amount, pricePoolPerAsset } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService | null;
  if (!asset) return serviceError(`Asset not found. Cannot retrieve assetId for holding escrow`);
  const { id: assetId } = asset.read();

  const escrow = (await EscrowService.get(context, {
    poolId,
    centrifugeId,
  })) as EscrowService | null;
  if (!escrow)
    return serviceError(`Escrow not found. Cannot retrieve escrow address for holding escrow`);
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

  await snapshotter(
    context,
    event,
    "balanceSheetV3:NoteDeposit",
    [holdingEscrow],
    HoldingEscrowSnapshot
  );
});

multiMapper("balanceSheet:Withdraw", async ({ event, context }) => {
  logEvent(event, context, "balanceSheet:Withdraw");
  const { poolId, scId: tokenId, asset: assetAddress, amount, pricePoolPerAsset } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService | null;
  if (!asset) return serviceError(`Asset not found. Cannot retrieve assetId for holding escrow`);
  const { id: assetId } = asset.read();

  const escrow = (await EscrowService.get(context, {
    poolId,
    centrifugeId,
  })) as EscrowService | null;
  if (!escrow)
    return serviceError(`Escrow not found. Cannot retrieve escrow address for holding escrow`);
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

  await snapshotter(
    context,
    event,
    "balanceSheetV3:Withdraw",
    [holdingEscrow],
    HoldingEscrowSnapshot
  );
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
