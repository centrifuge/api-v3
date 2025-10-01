import { Context, ponder } from "ponder:registry";
import { expandInlineObject, logEvent, serviceLog } from "../helpers/logger";
import {
  TokenService,
  OutstandingInvestService,
  OutstandingRedeemService,
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
} from "../services";
import { snapshotter } from "../helpers/snapshotter";
import { TokenSnapshot } from "ponder:schema";
import { EpochOutstandingRedeemService } from "../services/EpochOutstandingRedeemService";
import { HoldingEscrowSnapshot } from "ponder:schema";

// SHARE CLASS LIFECYCLE
ponder.on(
  "ShareClassManager:AddShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index)",
  async ({ event, context }) => {
    logEvent(event, context, "ShareClassManager:AddShareClassShort");
    const { poolId, scId: tokenId, index } = event.args;

    const centrifugeId = await BlockchainService.getCentrifugeId(context);

    const _token = (await TokenService.upsert(
      context,
      {
        id: tokenId,
        poolId,
        centrifugeId,
        isActive: true,
        index,
      },
      event.block
    )) as TokenService;
  }
);

ponder.on(
  "ShareClassManager:AddShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index, string name, string symbol, bytes32 salt)",
  async ({ event, context }) => {
    logEvent(event, context, "ShareClassManager:AddShareClassLong");
    const { poolId, scId: tokenId, index, name, symbol, salt } = event.args;

    const centrifugeId = await BlockchainService.getCentrifugeId(context);

    const _token = (await TokenService.upsert(
      context,
      {
        id: tokenId,
        poolId,
        centrifugeId,
        name,
        symbol,
        salt,
        isActive: true,
        index,
      },
      event.block
    )) as TokenService;
  }
);

// INVESTOR TRANSACTIONS
ponder.on("ShareClassManager:UpdateMetadata", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:UpdatedMetadata");
  const { poolId, scId: tokenId, name, symbol } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const token = (await TokenService.getOrInit(
    context,
    {
      id: tokenId,
      poolId,
      centrifugeId,
    },
    event.block
  )) as TokenService;
  await token.setMetadata(name, symbol);
  await token.save(event.block);
});

ponder.on(
  "ShareClassManager:UpdateDepositRequest",
  async ({ event, context }) => {
    logEvent(event, context, "ShareClassManager:UpdateDepositRequest");
    const chainId = context.chain.id;
    if (typeof chainId !== "number") throw new Error("Chain ID is required");

    const {
      poolId,
      scId: tokenId,
      //epoch: _epochIndex,
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
      event.block
    )) as AccountService;
    const { address: investorAddress } = investorAccount.read();

    const outstandingInvest = (await OutstandingInvestService.getOrInit(
      context,
      {
        poolId,
        tokenId,
        assetId: depositAssetId,
        account: investorAddress,
      },
      event.block
    )) as OutstandingInvestService;
    await outstandingInvest
      .decorateOutstandingOrder(event)
      .processHubDepositRequest(queuedUserAssetAmount, pendingUserAssetAmount)
      .saveOrClear(event.block);

    const epochOutstandingInvest =
      (await EpochOutstandingInvestService.getOrInit(
        context,
        {
          poolId,
          tokenId,
          assetId: depositAssetId,
        },
        event.block
      )) as EpochOutstandingInvestService;

    await epochOutstandingInvest
      .decorateEpochOutstandingInvest(event)
      .updatePendingAmount(pendingTotalAssetAmount)
      .save(event.block);
  }
);

ponder.on(
  "ShareClassManager:UpdateRedeemRequest",
  async ({ event, context }) => {
    logEvent(event, context, "ShareClassManager:UpdateRedeemRequest");
    const chainId = context.chain.id;
    if (typeof chainId !== "number") throw new Error("Chain ID is required");
    const {
      poolId,
      scId: tokenId,
      //epoch: epochIndex,
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
      event.block
    )) as AccountService;
    const { address: investorAddress } = investorAccount.read();

    const oo = (await OutstandingRedeemService.getOrInit(
      context,
      {
        poolId,
        tokenId,
        assetId: payoutAssetId,
        account: investorAddress,
      },
      event.block
    )) as OutstandingRedeemService;
    await oo
      .decorateOutstandingOrder(event)
      .processHubRedeemRequest(queuedUserShareAmount, pendingUserShareAmount)
      .saveOrClear(event.block);

    const epochOutstandingRedeem =
      (await EpochOutstandingRedeemService.getOrInit(
        context,
        {
          poolId,
          tokenId,
          assetId: payoutAssetId,
        },
        event.block
      )) as EpochOutstandingRedeemService;

    await epochOutstandingRedeem
      .decorateEpochOutstandingRedeem(event)
      .updatePendingAmount(pendingTotalShareAmount)
      .save(event.block);
  }
);

ponder.on("ShareClassManager:ApproveDeposits", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:ApproveDeposits");
  const {
    poolId,
    scId: tokenId,
    epoch: epochIndex,
    depositAssetId,
    approvedAssetAmount,
    approvedPoolAmount,
    pendingAssetAmount,
  } = event.args;

  const assetDecimals = await getAssetDecimals(context, depositAssetId);
  const approvedPercentage = computeApprovedPercentage(
    approvedAssetAmount,
    pendingAssetAmount,
    assetDecimals
  );

  const _epochInvestOrder = (await EpochInvestOrderService.insert(
    context,
    {
      poolId,
      tokenId,
      assetId: depositAssetId,
      index: epochIndex,
      approvedAt: new Date(Number(event.block.timestamp) * 1000),
      approvedAtBlock: Number(event.block.number),
      approvedAssetsAmount: approvedAssetAmount,
      approvedPoolAmount: approvedPoolAmount,
      approvedPercentageOfTotalPending: approvedPercentage,
    },
    event.block
  )) as EpochInvestOrderService | null;

  const saves: Promise<InvestOrderService | OutstandingInvestService>[] = [];
  const oos = (await OutstandingInvestService.query(context, {
    tokenId,
    assetId: depositAssetId,
    pendingAmount_not: 0n,
    approvedIndex: null,
    approvedAmount: 0n,
    approvedAt: null,
    approvedAtBlock: null,
  })) as OutstandingInvestService[];

  for (const oo of oos) {
    serviceLog(`Processing ShareClassManager:ApproveDeposits for outstanding invest with index ${epochIndex}`, expandInlineObject(oo.read()));
    const { pendingAmount } = oo.read();
    const approvedUserAssetAmount = computeApprovedUserAmount(
      pendingAmount!,
      approvedPercentage,
      assetDecimals
    );
    oo.approveInvest(approvedUserAssetAmount, epochIndex, event.block);
    saves.push(oo.save(event.block));
  }
  await Promise.all(saves);

  const holdingEscrows = await HoldingEscrowService.query(context, { tokenId, assetAmount_not: 0n }) as HoldingEscrowService[];
  await snapshotter(context, event, "ShareClassManager:ApproveDeposits", holdingEscrows, HoldingEscrowSnapshot);
});

ponder.on("ShareClassManager:ApproveRedeems", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:ApproveRedeems");
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

  const shareDecimals = await getAssetDecimals(context, currency);
  const approvedPercentage = computeApprovedPercentage(
    approvedShareAmount,
    pendingShareAmount,
    shareDecimals
  );

  const _epochRedeemOrder = (await EpochRedeemOrderService.insert(
    context,
    {
      poolId,
      tokenId,
      assetId: payoutAssetId,
      index: epochIndex,
      approvedAt: new Date(Number(event.block.timestamp) * 1000),
      approvedAtBlock: Number(event.block.number),
      approvedSharesAmount: approvedShareAmount,
      approvedPercentageOfTotalPending: approvedPercentage,
    },
    event.block
  )) as EpochRedeemOrderService | null;

  const saves: Promise<RedeemOrderService | OutstandingRedeemService>[] = [];
  const oos = (await OutstandingRedeemService.query(context, {
    tokenId,
    assetId: payoutAssetId,
    pendingAmount_not: 0n,
    approvedIndex: null,
    approvedAmount: 0n,
    approvedAt: null,
    approvedAtBlock: null,
  })) as OutstandingRedeemService[];
  for (const oo of oos) {
    serviceLog(`Processing ShareClassManager:ApproveRedeems for outstanding redeem with index ${epochIndex}`, expandInlineObject(oo.read()));
    const { pendingAmount } = oo.read();
    const approvedUserShareAmount = computeApprovedUserAmount(
      pendingAmount!,
      approvedPercentage,
      shareDecimals
    );
    oo.approveRedeem(approvedUserShareAmount, epochIndex, event.block);
    saves.push(oo.save(event.block));
  }
  await Promise.all(saves);

  const holdingEscrows = await HoldingEscrowService.query(context, { tokenId, assetAmount_not: 0n }) as HoldingEscrowService[];
  await snapshotter(context, event, "ShareClassManager:ApproveRedeems", holdingEscrows, HoldingEscrowSnapshot);
});

ponder.on("ShareClassManager:IssueShares", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:IssueShares");
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
    console.log(
      `EpochInvestOrder not found for token ${tokenId} asset ${depositAssetId} index ${epochIndex}`
    );
    return;
  }
  epochInvestOrder.issuedShares(
    issuedShareAmount,
    navPoolPerShare,
    navAssetPerShare,
    event.block
  );
  await epochInvestOrder.save(event.block);

  const assetDecimals = await getAssetDecimals(context, depositAssetId);
  const outstandingInvests = (await OutstandingInvestService.query(context, {
    tokenId,
    assetId: depositAssetId,
    approvedAmount_not: 0n,
    approvedIndex: epochIndex,
  })) as OutstandingInvestService[];

  const outstandingInvestSaves: Promise<OutstandingInvestService>[] = [];
  const investOrderSaves: Promise<InvestOrderService>[] = [];
  for (const outstandingInvest of outstandingInvests) {
    serviceLog(`Processing ShareClassManager:IssueShares for outstanding invest with index ${epochIndex}`, expandInlineObject(outstandingInvest.read()));
    const {
      poolId,
      tokenId,
      assetId,
      account,
      approvedAmount,
      approvedAt,
      approvedAtBlock,
      approvedIndex,
    } = outstandingInvest.read();
    const investOrder = (await InvestOrderService.getOrInit(
      context,
      {
        poolId,
        tokenId,
        assetId,
        index: approvedIndex!,
        account,
        approvedAssetsAmount: approvedAmount,
        approvedAt,
        approvedAtBlock,
      },
      event.block
    )) as InvestOrderService;
    investOrder.issueShares(
      navAssetPerShare,
      navPoolPerShare,
      assetDecimals,
      event.block
    );
    investOrderSaves.push(investOrder.save(event.block));
    outstandingInvestSaves.push(outstandingInvest.clear(event.block));
  }

  await Promise.all(investOrderSaves);
  await Promise.all(outstandingInvestSaves);
});

ponder.on("ShareClassManager:RevokeShares", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:RevokeShares");
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
  const { currency } = pool.read();
  if (!currency) throw new Error("Currency is required");

  const epochRedeemOrder = (await EpochRedeemOrderService.get(context, {
    tokenId,
    assetId: payoutAssetId,
    index: epochIndex,
  })) as EpochRedeemOrderService | null;
  if (!epochRedeemOrder) {
    console.log(
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
    event.block
  );
  await epochRedeemOrder.save(event.block);

  const shareDecimals = await getAssetDecimals(context, currency);
  const outstandingRedeems = (await OutstandingRedeemService.query(context, {
    tokenId,
    assetId: payoutAssetId,
    approvedAmount_not: 0n,
    approvedIndex: epochIndex,
  })) as OutstandingRedeemService[];

  const outstandingRedeemSaves: Promise<OutstandingRedeemService>[] = [];
  const redeemOrderSaves: Promise<RedeemOrderService>[] = [];
  for (const outstandingRedeem of outstandingRedeems) {
    serviceLog(`Processing ShareClassManager:RevokeShares for outstanding redeem with index ${epochIndex}`, expandInlineObject(outstandingRedeem.read()));
    const { approvedIndex, account, approvedAt, approvedAtBlock } = outstandingRedeem.read();
    const redeemOrder = (await RedeemOrderService.getOrInit(
      context,
      {
        poolId,
        tokenId,
        assetId: payoutAssetId,
        index: approvedIndex!,
        account,
        approvedAt,
        approvedAtBlock,
      },
      event.block
    )) as RedeemOrderService;
    redeemOrder.revokeShares(
      navAssetPerShare,
      navPoolPerShare,
      shareDecimals,
      event.block
    );
    outstandingRedeemSaves.push(outstandingRedeem.clear(event.block));
    redeemOrderSaves.push(redeemOrder.save(event.block));
  }
  await Promise.all([...outstandingRedeemSaves, ...redeemOrderSaves]);
});

ponder.on("ShareClassManager:UpdateShareClass", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:UpdateShareClass");
  const { poolId, scId: tokenId, navPoolPerShare: tokenPrice } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const token = (await TokenService.getOrInit(
    context,
    {
      id: tokenId,
      poolId,
      centrifugeId,
    },
    event.block
  )) as TokenService;
  if (!token) throw new Error(`Token not found for id ${tokenId}`);
  await token.setTokenPrice(tokenPrice);
  await token.save(event.block);
  await snapshotter(
    context,
    event,
    "ShareClassManager:UpdateShareClass",
    [token],
    TokenSnapshot
  );
});

ponder.on("ShareClassManager:ClaimDeposit", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:ClaimDeposit");
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const {
    //poolId,
    scId: tokenId,
    epoch: epochIndex,
    investor,
    depositAssetId: assetId,
    //paymentAssetAmount,
    //pendingAssetAmount,
    //claimedShareAmount,
    //issuedAt,
  } = event.args;

  const investorAccount = (await AccountService.getOrInit(
    context,
    {
      address: investor.substring(0, 42) as `0x${string}`,
    },
    event.block
  )) as AccountService;
  const { address: investorAddress } = investorAccount.read();

  const investOrder = (await InvestOrderService.get(context, {
    tokenId,
    assetId,
    account: investorAddress,
    index: epochIndex,
  })) as InvestOrderService;
  if (!investOrder) {
    console.log(
      `Invest order ${tokenId}-${assetId}-${investorAddress}-${epochIndex} not found`
    );
    return;
  }
  await investOrder.claimDeposit(event.block).save(event.block);
});

ponder.on("ShareClassManager:ClaimRedeem", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:ClaimRedeem");
  const {
    //poolId,
    scId: tokenId,
    epoch: epochIndex,
    investor,
    payoutAssetId: assetId,
    //paymentShareAmount,
    //pendingShareAmount,
    //claimedAssetAmount,
    //revokedAt,
  } = event.args;

  const investorAccount = (await AccountService.getOrInit(
    context,
    {
      address: investor.substring(0, 42) as `0x${string}`,
    },
    event.block
  )) as AccountService;
  const { address: investorAddress } = investorAccount.read();

  const redeemOrder = (await RedeemOrderService.get(context, {
    tokenId,
    assetId,
    account: investorAddress,
    index: epochIndex,
  })) as RedeemOrderService;
  if (!redeemOrder) {
    console.log(
      `Redeem order ${tokenId}-${assetId}-${investorAddress}-${epochIndex} not found`
    );
    return;
  }
  await redeemOrder.claimRedeem(event.block).save(event.block);
});

/**
 * Compute the percentage of the approved amount that is approved.
 * @param approveAmount - The amount of the approved amount.
 * @param pendingAmount - The amount of the pending amount.
 * @param decimals - The decimals of the asset.
 * @returns The percentage of the approved amount that is approved.
 */
function computeApprovedPercentage(
  approveAmount: bigint,
  pendingAmount: bigint,
  decimals: number
) {
  return (
    (approveAmount * 10n ** BigInt(decimals)) / (approveAmount + pendingAmount)
  );
}

/**
 * Compute the approved user amount.
 * @param totalApprovedAmount - The total approved amount.
 * @param approvedPercentage - The percentage of the approved amount that is approved.
 * @param decimals - The decimals of the asset.
 * @returns The approved user amount.
 */
function computeApprovedUserAmount(
  totalApprovedAmount: bigint,
  approvedPercentage: bigint,
  decimals: number
) {
  return (totalApprovedAmount * approvedPercentage) / 10n ** BigInt(decimals);
}

/**
 * Get the decimals of an asset.
 * @param context - The context.
 * @param assetId - The id of the asset.
 * @returns The decimals of the asset.
 */
async function getAssetDecimals(context: Context, assetId: bigint) {
  if (assetId < 1000n) return 18;
  const asset = (await AssetService.get(context, {
    id: assetId,
  })) as AssetService;
  if (!asset) throw new Error(`Asset not found for id ${assetId}`);
  const { decimals } = asset.read();
  if (typeof decimals !== "number") throw new Error("Decimals is required");
  return decimals;
}
