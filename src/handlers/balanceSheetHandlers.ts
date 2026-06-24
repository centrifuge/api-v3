import { ponder } from "ponder:registry";
import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError } from "../helpers/logger";
import {
  AccountService,
  AssetService,
  BlockchainService,
  EscrowService,
  HoldingEscrowService,
  PoolManagerService,
  ShareIssuanceService,
} from "../services";
import { snapshotter } from "../helpers/snapshotter";
import { HoldingEscrowSnapshot } from "ponder:schema";
import { REGISTRY_VERSION_ORDER, getContractAddressesForChain } from "../contracts";
import { isLiveIndexingBlock } from "../helpers/liveIndexingWindow";

/**
 * A `BalanceSheet.issue()` / `revoke()` is "flow-driven" when its caller is the
 * async or sync request manager (i.e. it backs a deposit claim or sync deposit).
 * Anything else is a manual/operator issuance. We scan every registry version on
 * the chain because the manager address can differ across deployment versions.
 */
function isFlowMinter(chainId: number, sender: `0x${string}`): boolean {
  const target = sender.toLowerCase();
  for (let versionIndex = 0; versionIndex < REGISTRY_VERSION_ORDER.length; versionIndex++) {
    const addresses = getContractAddressesForChain(chainId, versionIndex);
    if (!addresses) continue;
    for (const name of ["asyncRequestManager", "syncManager"] as const) {
      if (addresses[name]?.toLowerCase() === target) return true;
    }
  }
  return false;
}

multiMapper("balanceSheet:NoteDeposit", async ({ event, context }) => {
  logEvent(event, context, "balanceSheet:NoteDeposit");
  const {
    poolId,
    scId: tokenId,
    asset: assetAddress,
    tokenId: assetTokenId,
    amount,
    pricePoolPerAsset,
  } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const asset = await AssetService.getByToken(context, {
    centrifugeId,
    address: assetAddress,
    assetTokenId,
  });
  if (!asset) return serviceError(`Asset not found. Cannot retrieve assetId for holding escrow`);
  const { id: assetId } = asset.read();

  const escrow = await EscrowService.getLatest(context, { poolId, centrifugeId });
  if (!escrow)
    return serviceError(`Escrow not found. Cannot retrieve escrow address for holding escrow`);
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
    event,
    undefined,
    true
  )) as HoldingEscrowService;

  await holdingEscrow
    .setEscrowAddress(escrowAddress)
    .increaseAssetAmount(amount)
    .setAssetPrice(pricePoolPerAsset)
    .save(event);

  await snapshotter(
    context,
    event,
    "balanceSheetV3_1:NoteDeposit",
    [holdingEscrow],
    HoldingEscrowSnapshot
  );
});

multiMapper("balanceSheet:Withdraw", async ({ event, context }) => {
  logEvent(event, context, "balanceSheet:Withdraw");
  const {
    poolId,
    scId: tokenId,
    asset: assetAddress,
    tokenId: assetTokenId,
    amount,
    pricePoolPerAsset,
  } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const asset = await AssetService.getByToken(context, {
    centrifugeId,
    address: assetAddress,
    assetTokenId,
  });
  if (!asset) return serviceError(`Asset not found. Cannot retrieve assetId for holding escrow`);
  const { id: assetId } = asset.read();

  const escrow = await EscrowService.getLatest(context, { poolId, centrifugeId });
  if (!escrow)
    return serviceError(`Escrow not found. Cannot retrieve escrow address for holding escrow`);
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
    event,
    undefined,
    true
  )) as HoldingEscrowService;

  holdingEscrow.setEscrowAddress(escrowAddress);
  holdingEscrow.decreaseAssetAmount(amount);
  holdingEscrow.setAssetPrice(pricePoolPerAsset);
  await holdingEscrow.save(event);

  await snapshotter(
    context,
    event,
    "balanceSheetV3_1:Withdraw",
    [holdingEscrow],
    HoldingEscrowSnapshot
  );
});

multiMapper("balanceSheet:UpdateManager", async ({ event, context }) => {
  logEvent(event, context, "balanceSheet:UpdateManager");

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const { who: _manager, poolId, canManage } = event.args;

  const managerAddress = _manager.toLowerCase().substring(0, 42) as `0x${string}`;

  const _account = (await AccountService.getOrInit(
    context,
    {
      address: managerAddress,
    },
    event
  )) as AccountService;

  const poolManager = (await PoolManagerService.getOrInit(
    context,
    {
      address: managerAddress,
      centrifugeId,
      poolId,
    },
    event,
    undefined,
    true
  )) as PoolManagerService;

  poolManager.setIsBalancesheetManager(canManage);
  if (isLiveIndexingBlock(event.block.timestamp)) {
    poolManager.setCrosschainInProgress();
  }
  await poolManager.save(event);
});

// Registered V3_1-only (not via multiMapper): the V3 Issue/Revoke ABI lacks the
// `sender` field that drives the manual-vs-flow classification.
ponder.on("balanceSheetV3_1:Issue", async ({ event, context }) => {
  logEvent(event, context, "balanceSheet:Issue");
  const { poolId, scId: tokenId, sender, to, pricePoolPerShare, shares } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const chainId = context.chain.id;

  await ShareIssuanceService.recordIssue(
    context,
    {
      centrifugeId,
      poolId,
      tokenId,
      sender,
      account: to,
      shares,
      pricePoolPerShare,
      isManual: !isFlowMinter(chainId, sender),
      logIndex: event.log.logIndex,
    },
    event
  );
});

ponder.on("balanceSheetV3_1:Revoke", async ({ event, context }) => {
  logEvent(event, context, "balanceSheet:Revoke");
  const { poolId, scId: tokenId, sender, from, pricePoolPerShare, shares } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const chainId = context.chain.id;

  await ShareIssuanceService.recordRevoke(
    context,
    {
      centrifugeId,
      poolId,
      tokenId,
      sender,
      account: from,
      shares,
      pricePoolPerShare,
      isManual: !isFlowMinter(chainId, sender),
      logIndex: event.log.logIndex,
    },
    event
  );
});
