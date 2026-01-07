import type { Event, Context } from "ponder:registry";
import { multiMapper } from "../helpers/multiMapper";
import {
  logEvent,
  serviceLog,
  serviceError,
  expandInlineObject,
} from "../helpers/logger";
import { snapshotter } from "../helpers/snapshotter";
import {
  AssetService,
  BlockchainService,
  AccountService,
  InvestOrderService,
  RedeemOrderService,
  VaultDepositService,
  VaultRedeemService,
  OutstandingInvestService,
  OutstandingRedeemService,
  HoldingEscrowService,
  EpochOutstandingInvestService,
  EpochOutstandingRedeemService,
  EpochInvestOrderService,
  EpochRedeemOrderService,
  PoolService,
  TokenService,
} from "../services";
import { timestamper } from "../helpers/timestamper";
import { HoldingEscrowSnapshot } from "ponder:schema";

multiMapper("batchRequestManager:UpdateDepositRequest", updateDepositRequest);
export async function updateDepositRequest({
  event,
  context,
}: {
  event: Event<
    | "batchRequestManagerV3_1:UpdateDepositRequest"
    | "shareClassManagerV3:UpdateDepositRequest"
  >;
  context: Context;
}) {
  logEvent(event, context, "shareClassManager:UpdateDepositRequest");
  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const { poolId, investor, ...args } = event.args;
  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const epochIndex = "epochId" in args ? args.epochId : args.epoch;
  const depositAssetId = "assetId" in args ? args.assetId : args.depositAssetId;
  const queuedUserAssetAmount =
    "queuedAmount" in args ? args.queuedAmount : args.queuedUserAssetAmount;
  const pendingUserAssetAmount =
    "pendingAmount" in args ? args.pendingAmount : args.pendingUserAssetAmount;
  const pendingTotalAssetAmount =
    "totalPendingAmount" in args
      ? args.totalPendingAmount
      : args.pendingTotalAssetAmount;

  const investorAccount = (await AccountService.getOrInit(
    context,
    {
      address: investor.substring(0, 42) as `0x${string}`,
    },
    event
  )) as AccountService;
  const { address: investorAddress } = investorAccount.read();

  const investOrder = (await InvestOrderService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      assetId: depositAssetId,
      account: investorAddress,
      index: epochIndex,
    },
    event,
    undefined,
    true
  )) as InvestOrderService;

  if (!investOrder.hasVaultDeposit()) {
    const vaultDeposit = (await VaultDepositService.get(context, {
      accountAddress: investorAddress,
      assetsAmount: queuedUserAssetAmount + pendingUserAssetAmount,
    })) as VaultDepositService | null;
    if (vaultDeposit) {
      const { centrifugeId, createdAtTxHash } = vaultDeposit.read();
      investOrder.setVaultDeposit(centrifugeId, createdAtTxHash!);
    } else {
      investOrder.setVaultDeposit(centrifugeId, event.transaction.hash);
    }
  }

  await investOrder.post(pendingUserAssetAmount, event).saveOrClear(event);

  // TODO: DEPRECATED to be deleted in future releases
  const outstandingInvest = (await OutstandingInvestService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      assetId: depositAssetId,
      account: investorAddress,
      depositAmount: queuedUserAssetAmount + pendingUserAssetAmount,
      approvedAt: null,
      approvedAtBlock: null,
    },
    event,
    undefined,
    true
  )) as OutstandingInvestService;
  await outstandingInvest
    .processHubDepositRequest(
      queuedUserAssetAmount,
      pendingUserAssetAmount,
      epochIndex
    )
    .saveOrClear(event);

  const epochOutstandingInvest = (await EpochOutstandingInvestService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      assetId: depositAssetId,
    },
    event
  )) as EpochOutstandingInvestService;

  await epochOutstandingInvest
    .updatePendingAmount(pendingTotalAssetAmount)
    .save(event);
}

multiMapper("batchRequestManager:UpdateRedeemRequest", updateRedeemRequest);
export async function updateRedeemRequest({
  event,
  context,
}: {
  event: Event<
    | "batchRequestManagerV3_1:UpdateRedeemRequest"
    | "shareClassManagerV3:UpdateRedeemRequest"
  >;
  context: Context;
}) {
  logEvent(event, context, "shareClassManager:UpdateRedeemRequest");
  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const { poolId, investor, ...args } = event.args;
  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const epochIndex = "epochId" in args ? args.epochId : args.epoch;
  const payoutAssetId =
    "payoutAssetId" in args ? args.payoutAssetId : args.assetId;
  const pendingUserShareAmount =
    "pendingUserShareAmount" in args
      ? args.pendingUserShareAmount
      : args.pendingAmount;
  const pendingTotalShareAmount =
    "pendingTotalShareAmount" in args
      ? args.pendingTotalShareAmount
      : args.totalPendingAmount;
  const queuedUserShareAmount =
    "queuedUserShareAmount" in args
      ? args.queuedUserShareAmount
      : args.queuedAmount;

  const investorAccount = (await AccountService.getOrInit(
    context,
    {
      address: investor.substring(0, 42) as `0x${string}`,
    },
    event
  )) as AccountService;
  const { address: investorAddress } = investorAccount.read();

  const redeemOrder = (await RedeemOrderService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      assetId: payoutAssetId,
      account: investorAddress,
      index: epochIndex,
    },
    event,
    undefined,
    true
  )) as RedeemOrderService;
  if (!redeemOrder.hasVaultRedeem()) {
    const vaultRedeem = (await VaultRedeemService.get(context, {
      accountAddress: investorAddress,
      sharesAmount: queuedUserShareAmount + pendingUserShareAmount,
    })) as VaultRedeemService | null;
    if (vaultRedeem) {
      const { centrifugeId, createdAtTxHash } = vaultRedeem.read();
      redeemOrder.setVaultRedeem(centrifugeId, createdAtTxHash!);
    } else {
      redeemOrder.setVaultRedeem(centrifugeId, event.transaction.hash);
    }
  }
  await redeemOrder.post(pendingUserShareAmount, event).saveOrClear(event);

  // TODO: DEPRECATED to be deleted in future releases
  const outstandingRedeem = (await OutstandingRedeemService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      assetId: payoutAssetId,
      account: investorAddress,
      depositAmount: queuedUserShareAmount + pendingUserShareAmount,
      approvedAt: null,
      approvedAtBlock: null,
    },
    event,
    undefined,
    true
  )) as OutstandingRedeemService;
  await outstandingRedeem
    .processHubRedeemRequest(
      queuedUserShareAmount,
      pendingUserShareAmount,
      epochIndex
    )
    .saveOrClear(event);

  const epochOutstandingRedeem = (await EpochOutstandingRedeemService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      assetId: payoutAssetId,
    },
    event
  )) as EpochOutstandingRedeemService;

  await epochOutstandingRedeem
    .updatePendingAmount(pendingTotalShareAmount)
    .save(event);
}

multiMapper("shareClassManager:ApproveDeposits", approveDeposits);
export async function approveDeposits({
  event,
  context,
}: {
  event: Event<
    | "batchRequestManagerV3_1:ApproveDeposits"
    | "shareClassManagerV3:ApproveDeposits"
  >;
  context: Context;
}) {
  logEvent(event, context, "shareClassManager:ApproveDeposits");
  const {
    poolId,
    approvedAssetAmount,
    approvedPoolAmount,
    pendingAssetAmount,
    ...args
  } = event.args;
  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const epochIndex = "epochId" in args ? args.epochId : args.epoch;
  const depositAssetId = "assetId" in args ? args.assetId : args.depositAssetId;

  const assetDecimals = await AssetService.getDecimals(context, depositAssetId);
  if (!assetDecimals)
    throw new Error(`Asset decimals not found for id ${depositAssetId}`);

  const approvedPercentage = computeApprovedPercentage(
    approvedAssetAmount,
    pendingAssetAmount
  );

  const _epochInvestOrder = (await EpochInvestOrderService.insert(
    context,
    {
      poolId,
      tokenId,
      assetId: depositAssetId,
      index: epochIndex,
      approvedAssetsAmount: approvedAssetAmount,
      approvedPoolAmount: approvedPoolAmount,
      approvedPercentageOfTotalPending: approvedPercentage,
      ...timestamper("approved", event),
    },
    event
  )) as EpochInvestOrderService | null;

  const investOrderSaves: Promise<InvestOrderService>[] = [];
  const investOrders = (await InvestOrderService.query(context, {
    tokenId,
    assetId: depositAssetId,
    index: epochIndex,
    postedAt_not: null,
    postedAssetsAmount_not: 0n,
    ...timestamper("approved", null),
  })) as InvestOrderService[];

  for (const investOrder of investOrders) {
    serviceLog(
      `Processing ShareClassManager:ApproveDeposits for outstanding invest with index ${epochIndex}`,
      expandInlineObject(investOrder.read())
    );
    const { postedAssetsAmount } = investOrder.read();
    const approvedUserAssetAmount = computeApprovedUserAmount(
      postedAssetsAmount!,
      approvedPercentage
    );
    investOrder.approve(approvedUserAssetAmount, event);
    investOrderSaves.push(investOrder.save(event));
  }
  await Promise.all(investOrderSaves);

  const holdingEscrows = (await HoldingEscrowService.query(context, {
    tokenId,
    assetAmount_not: 0n,
  })) as HoldingEscrowService[];
  await snapshotter(
    context,
    event,
    "shareClassManagerV3:ApproveDeposits",
    holdingEscrows,
    HoldingEscrowSnapshot
  );

  // TODO: DEPRECATED to be deleted in future releases
  const outstandingInvests = (await OutstandingInvestService.query(context, {
    tokenId,
    assetId: depositAssetId,
    depositAmount_not: 0n,
  })) as OutstandingInvestService[];
  const outstandingInvestSaves: Promise<OutstandingInvestService>[] = [];
  for (const outstandingInvest of outstandingInvests) {
    const { pendingAmount } = outstandingInvest.read();
    const approvedAssetAmount = computeApprovedUserAmount(
      pendingAmount!,
      approvedPercentage
    );
    outstandingInvest.approveInvest(approvedAssetAmount, epochIndex, event);
    outstandingInvestSaves.push(outstandingInvest.clear(event));
  }
  await Promise.all(outstandingInvestSaves);
}

multiMapper("shareClassManager:ApproveRedeems", approveRedeems);
export async function approveRedeems({
  event,
  context,
}: {
  event: Event<
    | "batchRequestManagerV3_1:ApproveRedeems"
    | "shareClassManagerV3:ApproveRedeems"
  >;
  context: Context;
}) {
  logEvent(event, context, "shareClassManager:ApproveRedeems");
  const { poolId, approvedShareAmount, pendingShareAmount, ...args } =
    event.args;
  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const epochIndex = "epochId" in args ? args.epochId : args.epoch;
  const payoutAssetId =
    "payoutAssetId" in args ? args.payoutAssetId : args.assetId;

  const pool = (await PoolService.get(context, {
    id: poolId,
  })) as PoolService;
  if (!pool) throw new Error(`Pool not found for id ${poolId}`);

  const { currency } = pool.read();
  if (!currency) throw new Error("Currency is required");

  const approvedPercentage = computeApprovedPercentage(
    approvedShareAmount,
    pendingShareAmount
  );

  const _epochRedeemOrder = (await EpochRedeemOrderService.insert(
    context,
    {
      poolId,
      tokenId,
      assetId: payoutAssetId,
      index: epochIndex,
      ...timestamper("approved", event),
      approvedSharesAmount: approvedShareAmount,
      approvedPercentageOfTotalPending: approvedPercentage,
    },
    event
  )) as EpochRedeemOrderService | null;

  const redeemOrderSaves: Promise<RedeemOrderService>[] = [];
  const redeemOrders = (await RedeemOrderService.query(context, {
    tokenId,
    assetId: payoutAssetId,
    index: epochIndex,
    postedAt_not: null,
    postedSharesAmount_not: 0n,
    ...timestamper("approved", null),
  })) as RedeemOrderService[];
  for (const redeemOrder of redeemOrders) {
    serviceLog(
      `Processing ShareClassManager:ApproveRedeems for outstanding redeem with index ${epochIndex}`,
      expandInlineObject(redeemOrder.read())
    );
    const { postedSharesAmount } = redeemOrder.read();
    const approvedUserShareAmount = computeApprovedUserAmount(
      postedSharesAmount!,
      approvedPercentage
    );
    redeemOrder.approve(approvedUserShareAmount, event);
    redeemOrderSaves.push(redeemOrder.save(event));
  }
  await Promise.all(redeemOrderSaves);

  const holdingEscrows = (await HoldingEscrowService.query(context, {
    tokenId,
    assetAmount_not: 0n,
  })) as HoldingEscrowService[];
  await snapshotter(
    context,
    event,
    "shareClassManagerV3:ApproveRedeems",
    holdingEscrows,
    HoldingEscrowSnapshot
  );

  // TODO: DEPRECATED to be deleted in future releases
  const outstandingRedeems = (await OutstandingRedeemService.query(context, {
    tokenId,
    assetId: payoutAssetId,
    pendingAmount_not: 0n,
  })) as OutstandingRedeemService[];
  const outstandingRedeemSaves: Promise<OutstandingRedeemService>[] = [];
  for (const outstandingRedeem of outstandingRedeems) {
    const { pendingAmount } = outstandingRedeem.read();
    const approvedShareAmount = computeApprovedUserAmount(
      pendingAmount!,
      approvedPercentage
    );
    outstandingRedeem.approveRedeem(approvedShareAmount, epochIndex, event);
    outstandingRedeemSaves.push(outstandingRedeem.clear(event));
  }
  await Promise.all(outstandingRedeemSaves);
}

multiMapper("shareClassManager:IssueShares", issueShares);
export async function issueShares({
  event,
  context,
}: {
  event: Event<
    "batchRequestManagerV3_1:IssueShares" | "shareClassManagerV3:IssueShares"
  >;
  context: Context;
}) {
  logEvent(event, context, "shareClassManager:IssueShares");
  const {
    //poolId,
    issuedShareAmount,
    ...args
  } = event.args;
  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const epochIndex = "epochId" in args ? args.epochId : args.epoch;
  const depositAssetId = "assetId" in args ? args.assetId : args.depositAssetId;
  const navAssetPerShare =
    "priceAssetPerShare" in args
      ? args.priceAssetPerShare
      : args.navAssetPerShare;
  const navPoolPerShare =
    "pricePoolPerShare" in args ? args.pricePoolPerShare : args.navPoolPerShare;

  const epochInvestOrder = (await EpochInvestOrderService.get(context, {
    tokenId,
    assetId: depositAssetId,
    index: epochIndex,
  })) as EpochInvestOrderService | null;
  if (!epochInvestOrder) {
    serviceError(
      `EpochInvestOrder not found for token ${tokenId} asset ${depositAssetId} index ${epochIndex}`
    );
    return;
  }
  epochInvestOrder.issuedShares(
    issuedShareAmount,
    navPoolPerShare,
    navAssetPerShare,
    event
  );
  await epochInvestOrder.save(event);

  const assetDecimals = await AssetService.getDecimals(context, depositAssetId);
  if (!assetDecimals)
    throw new Error(`Asset decimals not found for id ${depositAssetId}`);

  const tokenDecimals = await TokenService.getDecimals(context, tokenId);
  if (!tokenDecimals)
    throw new Error(`Token decimals not found for id ${tokenId}`);

  const investOrders = (await InvestOrderService.query(context, {
    tokenId,
    assetId: depositAssetId,
    index: epochIndex,
    approvedAt_not: null,
    ...timestamper("issued", null),
  })) as InvestOrderService[];

  const investOrderSaves: Promise<InvestOrderService>[] = [];
  for (const investOrder of investOrders) {
    serviceLog(
      `Processing shareClassManager:IssueShares for outstanding invest with epochIndex ${epochIndex}`,
      expandInlineObject(investOrder.read())
    );

    investOrder.issueShares(
      navAssetPerShare,
      navPoolPerShare,
      assetDecimals,
      tokenDecimals,
      event
    );
    investOrderSaves.push(investOrder.save(event));
  }

  await Promise.all(investOrderSaves);
}

multiMapper("shareClassManager:RevokeShares", revokeShares);
export async function revokeShares({
  event,
  context,
}: {
  event: Event<"batchRequestManagerV3_1:RevokeShares" | "shareClassManagerV3:RevokeShares">;
  context: Context;
}) {
  logEvent(event, context, "shareClassManager:RevokeShares");
  const {
    poolId,
    ...args
  } = event.args;

  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const epochIndex = "epochId" in args ? args.epochId : args.epoch;
  const payoutAssetId = "payoutAssetId" in args ? args.payoutAssetId : args.assetId;
  const revokedShareAmount = "approvedShareAmount" in args ? args.approvedShareAmount : args.revokedShareAmount;
  const revokedAssetAmount = "payoutAssetAmount" in args ? args.payoutAssetAmount : args.revokedAssetAmount;
  const revokedPoolAmount = "payoutPoolAmount" in args ? args.payoutPoolAmount : args.revokedPoolAmount;
  const navAssetPerShare = "priceAssetPerShare" in args ? args.priceAssetPerShare : args.navAssetPerShare;
  const navPoolPerShare = "pricePoolPerShare" in args ? args.pricePoolPerShare : args.navPoolPerShare;

  const pool = (await PoolService.get(context, {
    id: poolId,
  })) as PoolService;
  if (!pool) throw new Error(`Pool not found for id ${poolId}`);
  const { currency: poolCurrency } = pool.read();
  if (!poolCurrency) throw new Error("Pool currency is required");

  const epochRedeemOrder = (await EpochRedeemOrderService.get(context, {
    tokenId,
    assetId: payoutAssetId,
    index: epochIndex,
  })) as EpochRedeemOrderService | null;
  if (!epochRedeemOrder) {
    serviceError(
      `EpochRedeemOrder not found for token ${tokenId} asset ${payoutAssetId} index ${epochIndex}`
    );
    return;
  }
  epochRedeemOrder.revokedShares(
    revokedShareAmount,
    revokedAssetAmount,
    revokedPoolAmount,
    navPoolPerShare,
    navAssetPerShare,
    event
  );
  await epochRedeemOrder.save(event);

  const tokenDecimals = await TokenService.getDecimals(context, tokenId);
  if (!tokenDecimals)
    throw new Error(`Token decimals not found for id ${tokenId}`);

  const assetDecimals = await AssetService.getDecimals(context, payoutAssetId);
  if (!assetDecimals)
    throw new Error(`Asset decimals not found for id ${payoutAssetId}`);

  const redeemOrders = (await RedeemOrderService.query(context, {
    tokenId,
    assetId: payoutAssetId,
    index: epochIndex,
    approvedAt_not: null,
    ...timestamper("revoked", null),
  })) as RedeemOrderService[];

  const redeemOrderSaves: Promise<RedeemOrderService>[] = [];
  for (const redeemOrder of redeemOrders) {
    serviceLog(
      `Processing ShareClassManager:RevokeShares for outstanding redeem with index ${epochIndex}`,
      expandInlineObject(redeemOrder.read())
    );

    redeemOrder.revokeShares(
      navAssetPerShare,
      navPoolPerShare,
      tokenDecimals,
      assetDecimals,
      event
    );
    redeemOrderSaves.push(redeemOrder.save(event));
  }
  await Promise.all(redeemOrderSaves);
};

multiMapper("shareClassManager:ClaimDeposit", claimDeposit);
export async function claimDeposit({
  event,
  context,
}: {
  event: Event<"batchRequestManagerV3_1:ClaimDeposit" | "shareClassManagerV3:ClaimDeposit">;
  context: Context;
}) {
  logEvent(event, context, "shareClassManager:ClaimDeposit");
  const {
    //poolId,
    investor,
    ...args
  } = event.args;

  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const epochIndex = "epochId" in args ? args.epochId : args.epoch;
  const assetId = "assetId" in args ? args.assetId : args.depositAssetId;
  const claimedShareAmount = "payoutShareAmount" in args ? args.payoutShareAmount : args.claimedShareAmount;

  const investorAccount = (await AccountService.getOrInit(
    context,
    {
      address: investor.substring(0, 42) as `0x${string}`,
    },
    event
  )) as AccountService;
  const { address: investorAddress } = investorAccount.read();

  const investOrder = (await InvestOrderService.get(context, {
    tokenId,
    assetId,
    account: investorAddress,
    index: epochIndex,
    issuedAt_not: null,
    ...timestamper("claimed", null),
  })) as InvestOrderService;
  if (!investOrder) {
    serviceError(
      `Invest order ${tokenId}-${assetId}-${investorAddress}-${epochIndex} not found`
    );
    return;
  }
  await investOrder.claimDeposit(claimedShareAmount, event).save(event);
};

multiMapper("shareClassManager:ClaimRedeem", claimRedeem);
export async function claimRedeem({
  event,
  context,
}: {
  event: Event<"batchRequestManagerV3_1:ClaimRedeem" | "shareClassManagerV3:ClaimRedeem">;
  context: Context;
}) {
  logEvent(event, context, "shareClassManager:ClaimRedeem");
  const {
    //poolId,
    investor,
    ...args
  } = event.args;

  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const epochIndex = "epochId" in args ? args.epochId : args.epoch;
  const assetId = "assetId" in args ? args.assetId : args.payoutAssetId;
  const claimedAssetAmount = "payoutAssetAmount" in args ? args.payoutAssetAmount : args.claimedAssetAmount;

  const investorAccount = (await AccountService.getOrInit(
    context,
    {
      address: investor.substring(0, 42) as `0x${string}`,
    },
    event
  )) as AccountService;
  const { address: investorAddress } = investorAccount.read();

  const redeemOrder = (await RedeemOrderService.get(context, {
    tokenId,
    assetId,
    account: investorAddress,
    index: epochIndex,
    revokedAt_not: null,
    ...timestamper("claimed", null),
  })) as RedeemOrderService;
  if (!redeemOrder) {
    serviceError(
      `Redeem order ${tokenId}-${assetId}-${investorAddress}-${epochIndex} not found`
    );
    return;
  }
  await redeemOrder.claimRedeem(claimedAssetAmount, event).save(event);
};

/**
 * Compute the percentage of the approved amount that is approved.
 * @param approveAmount - The amount of the approved amount.
 * @param pendingAmount - The amount of the pending amount.
 * @returns The percentage of the approved amount that is approved with 18 decimals.
 */
function computeApprovedPercentage(
  approveAmount: bigint,
  pendingAmount: bigint
) {
  return (approveAmount * 10n ** 18n) / (approveAmount + pendingAmount);
}

/**
 * Compute the approved user amount.
 * @param totalApprovedAmount - The total approved amount.
 * @param approvedPercentage - The percentage of the approved amount that is approved.
 * @returns The approved user amount.
 */
function computeApprovedUserAmount(
  totalApprovedAmount: bigint,
  approvedPercentage: bigint
) {
  return (totalApprovedAmount * approvedPercentage) / 10n ** 18n;
}
