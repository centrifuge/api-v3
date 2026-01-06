import { multiMapper } from "../helpers/multiMapper";
import {
  expandInlineObject,
  logEvent,
  serviceLog,
  serviceError,
} from "../helpers/logger";
import {
  TokenService,
  OutstandingInvestService, // TODO: DEPRECATED to be deleted in future releases
  OutstandingRedeemService, // TODO: DEPRECATED to be deleted in future releases
  BlockchainService,
  InvestOrderService,
  RedeemOrderService,
  EpochInvestOrderService,
  EpochRedeemOrderService,
  EpochOutstandingInvestService,
  AssetService,
  PoolService,
  AccountService,
  HoldingEscrowService,
  VaultDepositService,
  VaultRedeemService
} from "../services";
import { snapshotter } from "../helpers/snapshotter";
import { TokenSnapshot } from "ponder:schema";
import { EpochOutstandingRedeemService } from "../services/EpochOutstandingRedeemService";
import { HoldingEscrowSnapshot } from "ponder:schema";
import { timestamper } from "../helpers/timestamper";

// SHARE CLASS LIFECYCLE
multiMapper(
  "shareClassManager:AddShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index)",
  async ({ event, context }) => {
    logEvent(event, context, "shareClassManager:AddShareClassShort");
    const { poolId, scId: tokenId, index } = event.args;

    const centrifugeId = await BlockchainService.getCentrifugeId(context);
    const pool = (await PoolService.get(context, {
      id: poolId,
    })) as PoolService;
    const { decimals: poolDecimals } = pool.read();
    if (typeof poolDecimals !== "number")
      serviceError(
        "Pool decimals is not a initialised",
        expandInlineObject(pool.read())
      );

    const _token = (await TokenService.upsert(
      context,
      {
        id: tokenId,
        poolId,
        centrifugeId,
        isActive: true,
        index,
        decimals: poolDecimals,
      },
      event
    )) as TokenService;
  }
);

multiMapper(
  "shareClassManager:AddShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index, string name, string symbol, bytes32 salt)",
  async ({ event, context }) => {
    logEvent(event, context, "shareClassManager:AddShareClassLong");
    const { poolId, scId: tokenId, index, name, symbol, salt } = event.args;

    const centrifugeId = await BlockchainService.getCentrifugeId(context);
    const pool = (await PoolService.get(context, {
      id: poolId,
    })) as PoolService;
    const { decimals: poolDecimals } = pool.read();
    if (typeof poolDecimals !== "number")
      serviceError(
        "Pool decimals is not a initialised",
        expandInlineObject(pool.read())
      );

    const _token = (await TokenService.upsert(
      context,
      {
        id: tokenId,
        poolId,
        centrifugeId,
        name,
        symbol,
        salt,
        decimals: poolDecimals,
        isActive: true,
        index,
      },
      event
    )) as TokenService;
  }
);

// INVESTOR TRANSACTIONS
multiMapper("shareClassManager:UpdateMetadata", async ({ event, context }) => {
  logEvent(event, context, "shareClassManager:UpdatedMetadata");
  const { poolId, scId: tokenId, name, symbol } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const token = (await TokenService.getOrInit(
    context,
    {
      id: tokenId,
      poolId,
      centrifugeId,
    },
    event
  )) as TokenService;
  await token.setMetadata(name, symbol);
  await token.save(event);
});

multiMapper(
  "shareClassManager:UpdateDepositRequest",
  async ({ event, context }) => {
    logEvent(event, context, "shareClassManager:UpdateDepositRequest");
    const centrifugeId = await BlockchainService.getCentrifugeId(context);

    const {
      poolId,
      scId: tokenId,
      epoch: epochIndex,
      investor,
      depositAssetId,
      queuedUserAssetAmount,
      pendingTotalAssetAmount,
      pendingUserAssetAmount,
    } = event.args;

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
      const vaultDeposit = await VaultDepositService.get(
        context,
        {
          accountAddress: investorAddress,
          assetsAmount: queuedUserAssetAmount + pendingUserAssetAmount,
        },
      ) as VaultDepositService | null;
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

    const epochOutstandingInvest =
      (await EpochOutstandingInvestService.getOrInit(
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
);

multiMapper(
  "shareClassManager:UpdateRedeemRequest",
  async ({ event, context }) => {
    logEvent(event, context, "shareClassManager:UpdateRedeemRequest");
    const centrifugeId = await BlockchainService.getCentrifugeId(context);
    const {
      poolId,
      scId: tokenId,
      epoch: epochIndex,
      investor,
      payoutAssetId,
      pendingUserShareAmount,
      pendingTotalShareAmount,
      queuedUserShareAmount,
    } = event.args;

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
    if(!redeemOrder.hasVaultRedeem()) {
      const vaultRedeem = await VaultRedeemService.get(context, {
        accountAddress: investorAddress,
        sharesAmount: queuedUserShareAmount + pendingUserShareAmount,
      }) as VaultRedeemService | null;
      if(vaultRedeem) {
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

    const epochOutstandingRedeem =
      (await EpochOutstandingRedeemService.getOrInit(
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
);

multiMapper("shareClassManager:ApproveDeposits", async ({ event, context }) => {
  logEvent(event, context, "shareClassManager:ApproveDeposits");
  const {
    poolId,
    scId: tokenId,
    epoch: epochIndex,
    depositAssetId,
    approvedAssetAmount,
    approvedPoolAmount,
    pendingAssetAmount,
  } = event.args;

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
});

multiMapper("shareClassManager:ApproveRedeems", async ({ event, context }) => {
  logEvent(event, context, "shareClassManager:ApproveRedeems");
  const {
    poolId,
    scId: tokenId,
    epoch: epochIndex,
    payoutAssetId,
    approvedShareAmount,
    pendingShareAmount,
  } = event.args;

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
});

multiMapper("shareClassManager:IssueShares", async ({ event, context }) => {
  logEvent(event, context, "shareClassManager:IssueShares");
  const {
    //poolId,
    scId: tokenId,
    epoch: epochIndex,
    depositAssetId,
    navAssetPerShare,
    navPoolPerShare,
    issuedShareAmount,
  } = event.args;

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
});

multiMapper("shareClassManager:RevokeShares", async ({ event, context }) => {
  logEvent(event, context, "shareClassManager:RevokeShares");
  const {
    poolId,
    scId: tokenId,
    epoch: epochIndex,
    payoutAssetId,
    navAssetPerShare,
    navPoolPerShare,
    revokedShareAmount,
    revokedAssetAmount,
    revokedPoolAmount,
  } = event.args;

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
});

multiMapper(
  "shareClassManager:UpdateShareClass",
  async ({ event, context }) => {
    logEvent(event, context, "shareClassManager:UpdateShareClass");
    const { poolId, scId: tokenId, navPoolPerShare: tokenPrice } = event.args;

    const centrifugeId = await BlockchainService.getCentrifugeId(context);

    const token = (await TokenService.getOrInit(
      context,
      {
        id: tokenId,
        poolId,
        centrifugeId,
      },
      event
    )) as TokenService;
    if (!token) throw new Error(`Token not found for id ${tokenId}`);
    await token.setTokenPrice(tokenPrice);
    await token.save(event);
    await snapshotter(
      context,
      event,
      "shareClassManagerV3:UpdateShareClass",
      [token],
      TokenSnapshot
    );
  }
);

multiMapper("shareClassManager:ClaimDeposit", async ({ event, context }) => {
  logEvent(event, context, "shareClassManager:ClaimDeposit");
  const {
    //poolId,
    scId: tokenId,
    epoch: epochIndex,
    investor,
    depositAssetId: assetId,
    //paymentAssetAmount,
    //pendingAssetAmount,
    claimedShareAmount,
    //issuedAt,
  } = event.args;

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
});

multiMapper("shareClassManager:ClaimRedeem", async ({ event, context }) => {
  logEvent(event, context, "shareClassManager:ClaimRedeem");
  const {
    //poolId,
    scId: tokenId,
    epoch: epochIndex,
    investor,
    payoutAssetId: assetId,
    //paymentShareAmount,
    //pendingShareAmount,
    claimedAssetAmount,
    //revokedAt,
  } = event.args;

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
});

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
