import type { Event, Context } from "ponder:registry";
import { loadBasinConfig } from "../config/basin";
import { linkBasinRedeemOrderToEpoch } from "../helpers/basinReconciliation";
import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceLog, serviceError, expandInlineObject } from "../helpers/logger";
import { snapshotter } from "../helpers/snapshotter";
import {
  BlockchainService,
  AccountService,
  AssetRegistrationService,
  InvestOrderService,
  RedeemOrderService,
  PendingInvestOrderService,
  PendingRedeemOrderService,
  HoldingEscrowService,
  EpochOutstandingInvestService,
  EpochOutstandingRedeemService,
  EpochInvestOrderService,
  EpochRedeemOrderService,
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
    "batchRequestManagerV3_1:UpdateDepositRequest" | "shareClassManagerV3:UpdateDepositRequest"
  >;
  context: Context;
}) {
  logEvent(event, context, "batchRequestManager:UpdateDepositRequest");
  const _centrifugeId = await BlockchainService.getCentrifugeId(context);

  const { poolId, investor, ...args } = event.args;
  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const depositAssetId = "assetId" in args ? args.assetId : args.depositAssetId;
  const queuedUserAssetAmount =
    "queuedAmount" in args ? args.queuedAmount : args.queuedUserAssetAmount;
  const pendingUserAssetAmount =
    "pendingAmount" in args ? args.pendingAmount : args.pendingUserAssetAmount;
  const pendingTotalAssetAmount =
    "totalPendingAmount" in args ? args.totalPendingAmount : args.pendingTotalAssetAmount;

  const investorAccount = (await AccountService.getOrInit(
    context,
    {
      address: investor.substring(0, 42) as `0x${string}`,
    },
    event
  )) as AccountService;
  const { address: investorAddress } = investorAccount.read();

  const pendingInvestOrder = (await PendingInvestOrderService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      assetId: depositAssetId,
      account: investorAddress,
    },
    event,
    undefined,
    true
  )) as PendingInvestOrderService;
  const { queuedAssetsAmount: lastQueuedAssetsAmount } = pendingInvestOrder.read();
  pendingInvestOrder.updateQueuedAmount(queuedUserAssetAmount);
  if (queuedUserAssetAmount === 0n) pendingInvestOrder.updatePendingAmount(pendingUserAssetAmount);
  await pendingInvestOrder.saveOrClear(event);

  const epochOutstandingInvest = (await EpochOutstandingInvestService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      assetId: depositAssetId,
    },
    event
  )) as EpochOutstandingInvestService;
  const deltaQueuedAssetsAmount = queuedUserAssetAmount - (lastQueuedAssetsAmount ?? 0n);
  await epochOutstandingInvest
    .updatePendingAmount(pendingTotalAssetAmount)
    .increaseQueuedAmount(deltaQueuedAssetsAmount)
    .saveOrClear(event);
}

multiMapper("batchRequestManager:UpdateRedeemRequest", updateRedeemRequest);
export async function updateRedeemRequest({
  event,
  context,
}: {
  event: Event<
    "batchRequestManagerV3_1:UpdateRedeemRequest" | "shareClassManagerV3:UpdateRedeemRequest"
  >;
  context: Context;
}) {
  logEvent(event, context, "batchRequestManager:UpdateRedeemRequest");
  const _centrifugeId = await BlockchainService.getCentrifugeId(context);
  const { poolId, investor, ...args } = event.args;
  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const payoutAssetId = "payoutAssetId" in args ? args.payoutAssetId : args.assetId;
  const pendingUserShareAmount =
    "pendingUserShareAmount" in args ? args.pendingUserShareAmount : args.pendingAmount;
  const pendingTotalShareAmount =
    "pendingTotalShareAmount" in args ? args.pendingTotalShareAmount : args.totalPendingAmount;
  const queuedUserShareAmount =
    "queuedUserShareAmount" in args ? args.queuedUserShareAmount : args.queuedAmount;

  const investorAccount = (await AccountService.getOrInit(
    context,
    {
      address: investor.substring(0, 42) as `0x${string}`,
    },
    event
  )) as AccountService;
  const { address: investorAddress } = investorAccount.read();

  const pendingRedeemOrder = (await PendingRedeemOrderService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      assetId: payoutAssetId,
      account: investorAddress,
    },
    event,
    undefined,
    true
  )) as PendingRedeemOrderService;
  const { queuedSharesAmount: lastQueuedSharesAmount } = pendingRedeemOrder.read();
  pendingRedeemOrder.updateQueuedAmount(queuedUserShareAmount);
  if (queuedUserShareAmount === 0n) pendingRedeemOrder.updatePendingAmount(pendingUserShareAmount);

  await pendingRedeemOrder.saveOrClear(event);

  const epochOutstandingRedeem = (await EpochOutstandingRedeemService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      assetId: payoutAssetId,
    },
    event
  )) as EpochOutstandingRedeemService;
  const deltaQueuedSharesAmount = queuedUserShareAmount - (lastQueuedSharesAmount ?? 0n);
  await epochOutstandingRedeem
    .updatePendingAmount(pendingTotalShareAmount)
    .increaseQueuedAmount(deltaQueuedSharesAmount)
    .saveOrClear(event);
}

multiMapper("batchRequestManager:ApproveDeposits", approveDeposits);
export async function approveDeposits({
  event,
  context,
}: {
  event: Event<"batchRequestManagerV3_1:ApproveDeposits" | "shareClassManagerV3:ApproveDeposits">;
  context: Context;
}) {
  logEvent(event, context, "batchRequestManager:ApproveDeposits");
  const { poolId, approvedAssetAmount, approvedPoolAmount, pendingAssetAmount, ...args } =
    event.args;
  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const epochIndex = "epochId" in args ? args.epochId : args.epoch;
  const depositAssetId = "assetId" in args ? args.assetId : args.depositAssetId;

  const approvedPercentage = computeApprovedPercentage(approvedAssetAmount, pendingAssetAmount);

  await EpochInvestOrderService.upsert(
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
  );

  const epochOutstandingInvest = (await EpochOutstandingInvestService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      assetId: depositAssetId,
    },
    event
  )) as EpochOutstandingInvestService;
  await epochOutstandingInvest.updatePendingAmount(pendingAssetAmount).saveOrClear(event);

  const investOrderSaves: Promise<InvestOrderService>[] = [];
  const pendingInvestOrders = (await PendingInvestOrderService.query(context, {
    tokenId,
    assetId: depositAssetId,
    pendingAssetsAmount_gt: 0n,
  })) as PendingInvestOrderService[];

  const pendingInvestOrderSaves: Promise<PendingInvestOrderService>[] = [];
  for (const pendingInvestOrder of pendingInvestOrders) {
    const { account, pendingAssetsAmount } = pendingInvestOrder.read();
    if (!pendingAssetsAmount) continue;
    serviceLog(
      `Processing ShareClassManager:ApproveDeposits for pending invest of account ${account}`
    );
    const approvedUserAssetAmount = computeApprovedUserAmount(
      pendingAssetsAmount,
      approvedPercentage
    );
    const investOrder = (await InvestOrderService.insert(
      context,
      {
        poolId,
        tokenId,
        assetId: depositAssetId,
        account,
        index: epochIndex,
      },
      event,
      true
    )) as InvestOrderService;
    investOrder.approve(approvedUserAssetAmount, event);
    investOrderSaves.push(investOrder.save(event));
    pendingInvestOrder.updatePendingAmount(pendingAssetsAmount - approvedUserAssetAmount);
    pendingInvestOrderSaves.push(pendingInvestOrder.saveOrClear(event));
  }
  await Promise.all([...investOrderSaves, ...pendingInvestOrderSaves]);

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
}

multiMapper("batchRequestManager:ApproveRedeems", approveRedeems);
export async function approveRedeems({
  event,
  context,
}: {
  event: Event<"batchRequestManagerV3_1:ApproveRedeems" | "shareClassManagerV3:ApproveRedeems">;
  context: Context;
}) {
  logEvent(event, context, "batchRequestManager:ApproveRedeems");
  const { poolId, approvedShareAmount, pendingShareAmount, ...args } = event.args;
  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const epochIndex = "epochId" in args ? args.epochId : args.epoch;
  const payoutAssetId = "payoutAssetId" in args ? args.payoutAssetId : args.assetId;

  const approvedPercentage = computeApprovedPercentage(approvedShareAmount, pendingShareAmount);

  await EpochRedeemOrderService.upsert(
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
  );

  const epochOutstandingRedeem = (await EpochOutstandingRedeemService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      assetId: payoutAssetId,
    },
    event
  )) as EpochOutstandingRedeemService;
  await epochOutstandingRedeem.updatePendingAmount(pendingShareAmount).saveOrClear(event);

  const redeemOrderSaves: Promise<RedeemOrderService>[] = [];
  const pendingRedeemOrders = (await PendingRedeemOrderService.query(context, {
    tokenId,
    assetId: payoutAssetId,
    pendingSharesAmount_gt: 0n,
  })) as PendingRedeemOrderService[];

  const pendingRedeemOrderSaves: Promise<PendingRedeemOrderService>[] = [];
  for (const pendingRedeemOrder of pendingRedeemOrders) {
    const { account, pendingSharesAmount } = pendingRedeemOrder.read();
    if (!pendingSharesAmount) continue;
    serviceLog(
      `Processing ShareClassManager:ApproveRedeems for pending redeem of account ${account}`
    );
    const approvedUserShareAmount = computeApprovedUserAmount(
      pendingSharesAmount,
      approvedPercentage
    );
    const redeemOrder = (await RedeemOrderService.insert(
      context,
      {
        poolId,
        tokenId,
        assetId: payoutAssetId,
        account,
        index: epochIndex,
      },
      event,
      true
    )) as RedeemOrderService;
    redeemOrder.approve(approvedUserShareAmount, event);
    redeemOrderSaves.push(redeemOrder.save(event));
    pendingRedeemOrder.updatePendingAmount(pendingSharesAmount - approvedUserShareAmount);
    pendingRedeemOrderSaves.push(pendingRedeemOrder.saveOrClear(event));

    const basinCfg = loadBasinConfig(context);
    if (basinCfg) {
      await linkBasinRedeemOrderToEpoch(context, event, basinCfg, {
        tokenId,
        assetId: payoutAssetId,
        account,
        epochIndex,
      });
    }
  }
  await Promise.all([...redeemOrderSaves, ...pendingRedeemOrderSaves]);

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
}

multiMapper("batchRequestManager:IssueShares", issueShares);
export async function issueShares({
  event,
  context,
}: {
  event: Event<"batchRequestManagerV3_1:IssueShares" | "shareClassManagerV3:IssueShares">;
  context: Context;
}) {
  logEvent(event, context, "batchRequestManager:IssueShares");
  const { poolId, issuedShareAmount, ...args } = event.args;
  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const epochIndex = "epochId" in args ? args.epochId : args.epoch;
  const depositAssetId = "assetId" in args ? args.assetId : args.depositAssetId;
  const navAssetPerShare =
    "priceAssetPerShare" in args ? args.priceAssetPerShare : args.navAssetPerShare;
  const navPoolPerShare =
    "pricePoolPerShare" in args ? args.pricePoolPerShare : args.navPoolPerShare;

  const epochInvestOrder = (await EpochInvestOrderService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      assetId: depositAssetId,
      index: epochIndex,
    },
    event
  )) as EpochInvestOrderService;
  epochInvestOrder.issuedShares(issuedShareAmount, navPoolPerShare, navAssetPerShare, event);
  await epochInvestOrder.save(event);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const token = (await TokenService.get(context, { id: tokenId })) as TokenService | null;
  if (!token) {
    return serviceError(`Token not found tokenId=${tokenId}. Cannot issue shares`);
  }

  const assetRegistration = (await AssetRegistrationService.get(context, {
    assetId: depositAssetId,
    centrifugeId,
  })) as AssetRegistrationService | null;
  if (!assetRegistration) {
    return serviceError(
      `AssetRegistration not found assetId=${depositAssetId} centrifugeId=${centrifugeId}. Cannot issue shares`
    );
  }

  const { decimals: shareDecimals } = token.read();
  const { decimals: assetDecimals } = assetRegistration.read();

  const investOrders = (await InvestOrderService.query(context, {
    tokenId,
    assetId: depositAssetId,
    index: epochIndex,
    approvedAt_not: null,
    issuedAt: null,
  })) as InvestOrderService[];

  const investOrderSaves: Promise<InvestOrderService>[] = [];
  for (const investOrder of investOrders) {
    serviceLog(
      `Processing shareClassManager:IssueShares for outstanding invest with epochIndex ${epochIndex}`,
      expandInlineObject(investOrder.read())
    );

    investOrder.issueShares(navAssetPerShare, navPoolPerShare, assetDecimals, shareDecimals, event);
    investOrderSaves.push(investOrder.save(event));
  }

  await Promise.all(investOrderSaves);
}

multiMapper("batchRequestManager:RevokeShares", revokeShares);
export async function revokeShares({
  event,
  context,
}: {
  event: Event<"batchRequestManagerV3_1:RevokeShares" | "shareClassManagerV3:RevokeShares">;
  context: Context;
}) {
  logEvent(event, context, "batchRequestManager:RevokeShares");
  const { poolId, ...args } = event.args;

  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const epochIndex = "epochId" in args ? args.epochId : args.epoch;
  const payoutAssetId = "payoutAssetId" in args ? args.payoutAssetId : args.assetId;
  const revokedShareAmount =
    "approvedShareAmount" in args ? args.approvedShareAmount : args.revokedShareAmount;
  const revokedAssetAmount =
    "payoutAssetAmount" in args ? args.payoutAssetAmount : args.revokedAssetAmount;
  const revokedPoolAmount =
    "payoutPoolAmount" in args ? args.payoutPoolAmount : args.revokedPoolAmount;
  const navAssetPerShare =
    "priceAssetPerShare" in args ? args.priceAssetPerShare : args.navAssetPerShare;
  const navPoolPerShare =
    "pricePoolPerShare" in args ? args.pricePoolPerShare : args.navPoolPerShare;

  const epochRedeemOrder = (await EpochRedeemOrderService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      assetId: payoutAssetId,
      index: epochIndex,
    },
    event
  )) as EpochRedeemOrderService;
  epochRedeemOrder.revokedShares(
    revokedShareAmount,
    revokedAssetAmount,
    revokedPoolAmount,
    navPoolPerShare,
    navAssetPerShare,
    event
  );
  await epochRedeemOrder.save(event);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const token = (await TokenService.get(context, { id: tokenId })) as TokenService | null;
  if (!token) {
    return serviceError(`Token not found tokenId=${tokenId}. Cannot revoke shares`);
  }

  const assetRegistration = (await AssetRegistrationService.get(context, {
    assetId: payoutAssetId,
    centrifugeId,
  })) as AssetRegistrationService | null;
  if (!assetRegistration) {
    return serviceError(
      `AssetRegistration not found assetId=${payoutAssetId} centrifugeId=${centrifugeId}. Cannot revoke shares`
    );
  }

  const { decimals: shareDecimals } = token.read();
  const { decimals: assetDecimals } = assetRegistration.read();

  const redeemOrders = (await RedeemOrderService.query(context, {
    tokenId,
    assetId: payoutAssetId,
    index: epochIndex,
    approvedAt_not: null,
    revokedAt: null,
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
      shareDecimals,
      assetDecimals,
      event
    );
    redeemOrderSaves.push(redeemOrder.save(event));
  }
  await Promise.all(redeemOrderSaves);
}

multiMapper("batchRequestManager:ClaimDeposit", claimDeposit);
export async function claimDeposit({
  event,
  context,
}: {
  event: Event<"batchRequestManagerV3_1:ClaimDeposit" | "shareClassManagerV3:ClaimDeposit">;
  context: Context;
}) {
  logEvent(event, context, "batchRequestManager:ClaimDeposit");
  const {
    //poolId,
    paymentAssetAmount,
    investor,
    ...args
  } = event.args;

  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const epochIndex = "epochId" in args ? args.epochId : args.epoch;
  const assetId = "assetId" in args ? args.assetId : args.depositAssetId;
  const claimedShareAmount =
    "payoutShareAmount" in args ? args.payoutShareAmount : args.claimedShareAmount;

  const token = (await TokenService.get(context, {
    id: tokenId,
  })) as TokenService;
  if (!token) return serviceError(`Token not found. Cannot retrieve poolId`);
  const { poolId } = token.read();

  const investorAccount = (await AccountService.getOrInit(
    context,
    {
      address: investor.substring(0, 42) as `0x${string}`,
    },
    event
  )) as AccountService;
  const { address: investorAddress } = investorAccount.read();

  const investOrder = (await InvestOrderService.get(context, {
    poolId,
    tokenId,
    assetId,
    account: investorAddress,
    index: epochIndex,
  })) as InvestOrderService | null;
  if (!investOrder) return serviceError(`InvestOrder not found. Cannot claim deposit`);
  await investOrder.claimDeposit(claimedShareAmount, paymentAssetAmount, event).save(event);
}

multiMapper("batchRequestManager:ClaimRedeem", claimRedeem);
export async function claimRedeem({
  event,
  context,
}: {
  event: Event<"batchRequestManagerV3_1:ClaimRedeem" | "shareClassManagerV3:ClaimRedeem">;
  context: Context;
}) {
  logEvent(event, context, "batchRequestManager:ClaimRedeem");
  const {
    //poolId,
    investor,
    paymentShareAmount,
    ...args
  } = event.args;

  const tokenId = "shareClassId" in args ? args.shareClassId : args.scId;
  const epochIndex = "epochId" in args ? args.epochId : args.epoch;
  const assetId = "assetId" in args ? args.assetId : args.payoutAssetId;
  const claimedAssetAmount =
    "payoutAssetAmount" in args ? args.payoutAssetAmount : args.claimedAssetAmount;

  const token = (await TokenService.get(context, {
    id: tokenId,
  })) as TokenService;
  if (!token) return serviceError(`Token not found. Cannot retrieve poolId`);
  const { poolId } = token.read();

  const investorAccount = (await AccountService.getOrInit(
    context,
    {
      address: investor.substring(0, 42) as `0x${string}`,
    },
    event
  )) as AccountService;
  const { address: investorAddress } = investorAccount.read();

  const redeemOrder = (await RedeemOrderService.get(context, {
    poolId,
    tokenId,
    assetId,
    account: investorAddress,
    index: epochIndex,
  })) as RedeemOrderService | null;
  if (!redeemOrder) return serviceError(`RedeemOrder not found. Cannot claim redeem`);
  await redeemOrder.claimRedeem(claimedAssetAmount, paymentShareAmount, event).save(event);
}

/**
 * Compute the percentage of the approved amount that is approved.
 * @param approveAmount - The amount of the approved amount.
 * @param pendingAmount - The amount of the pending amount.
 * @returns The percentage of the approved amount that is approved with 18 decimals.
 */
function computeApprovedPercentage(approveAmount: bigint, pendingAmount: bigint) {
  return (approveAmount * 10n ** 21n) / (pendingAmount + approveAmount);
}

/**
 * Compute the approved user amount.
 * @param totalApprovedAmount - The total approved amount.
 * @param approvedPercentage - The percentage of the approved amount that is approved.
 * @returns The approved user amount.
 */
function computeApprovedUserAmount(totalApprovedAmount: bigint, approvedPercentage: bigint) {
  return (totalApprovedAmount * approvedPercentage) / 10n ** 21n;
}
