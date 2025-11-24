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

ponder.on("BalanceSheetV3:NoteDeposit", async ({ event, context }) => {
  logEvent(event, context, "BalanceSheetV3:NoteDeposit");
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
    event.block
  )) as HoldingEscrowService;

  await holdingEscrow.increaseAssetAmount(amount);
  await holdingEscrow.setAssetPrice(pricePoolPerAsset);
  await holdingEscrow.save(event.block);

  await snapshotter(context, event, "BalanceSheetV3:NoteDeposit", [holdingEscrow], HoldingEscrowSnapshot);
});

ponder.on("BalanceSheetV3:Withdraw(uint64 indexed poolId, bytes16 indexed scId, address asset, uint256 tokenId, address receiver, uint128 amount, uint128 pricePoolPerAsset)", async ({ event, context }) => {
  logEvent(event, context, "BalanceSheetV3:Withdraw");
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
    event.block
  )) as HoldingEscrowService;

  await holdingEscrow.decreaseAssetAmount(amount);
  await holdingEscrow.setAssetPrice(pricePoolPerAsset);
  await holdingEscrow.save(event.block);

  await snapshotter(context, event, "BalanceSheetV3:Withdraw(uint64 indexed poolId, bytes16 indexed scId, address asset, uint256 tokenId, address receiver, uint128 amount, uint128 pricePoolPerAsset)", [holdingEscrow], HoldingEscrowSnapshot);
});

ponder.on("BalanceSheetV3:UpdateManager(uint64 indexed poolId, address indexed manager, bool canManage)", async ({ event, context }) => {
  logEvent(event, context, "BalanceSheetV3:UpdateManager");
  
  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const { manager, poolId, canManage } = event.args;

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
