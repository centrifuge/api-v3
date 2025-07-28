import { Context, ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import {
  TokenService,
  OutstandingInvestService,
  OutstandingRedeemService,
  BlockchainService,
  InvestOrderService,
  RedeemOrderService,
  EpochOutstandingInvestService,
  AssetService,
  PoolService,
} from "../services";
import { snapshotter } from "../helpers/snapshotter";
import { TokenSnapshot } from "ponder:schema";
import { EpochOutstandingRedeemService } from "../services/EpochOutstandingRedeemService";

// SHARE CLASS LIFECYCLE
ponder.on(
  "ShareClassManager:AddShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index)",
  async ({ event, context }) => {
    logEvent(event, context, "ShareClassManager:AddShareClassShort");
    const chainId = context.chain.id;
    if (typeof chainId !== "number") throw new Error("Chain ID is required");
    const { poolId, scId: tokenId, index } = event.args;

    const blockchain = await BlockchainService.get(context, {
      id: chainId.toString(),
    });
    if (!blockchain) throw new Error("Blockchain not found");
    const { centrifugeId } = blockchain.read();

    const token = (await TokenService.getOrInit(context, {
      id: tokenId,
      poolId,
      centrifugeId,
    })) as TokenService;
    await token.setIndex(index);
    await token.activate();
    await token.save();
  }
);

ponder.on(
  "ShareClassManager:AddShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index, string name, string symbol, bytes32 salt)",
  async ({ event, context }) => {
    logEvent(event, context, "ShareClassManager:AddShareClassLong");
    const chainId = context.chain.id;
    if (typeof chainId !== "number") throw new Error("Chain ID is required");
    const { poolId, scId: tokenId, index, name, symbol, salt } = event.args;

    const blockchain = await BlockchainService.get(context, {
      id: chainId.toString(),
    });
    if (!blockchain) throw new Error("Blockchain not found");
    const { centrifugeId } = blockchain.read();

    const token = (await TokenService.getOrInit(context, {
      id: tokenId,
      poolId,
      centrifugeId,
    })) as TokenService;
    await token.setIndex(index);
    await token.setMetadata(name, symbol, salt);
    await token.activate();
    await token.save();
  }
);

// INVESTOR TRANSACTIONS
ponder.on("ShareClassManager:UpdateMetadata", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:UpdatedMetadata");
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const { poolId, scId: tokenId, name, symbol } = event.args;

  const blockchain = await BlockchainService.get(context, {
    id: chainId.toString(),
  });
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

  const token = (await TokenService.getOrInit(context, {
    id: tokenId,
    poolId,
    centrifugeId,
  })) as TokenService;
  await token.setMetadata(name, symbol);
  await token.save();
});

ponder.on(
  "ShareClassManager:UpdateDepositRequest",
  async ({ event, context }) => {
    console.log("OODEBUG-");
    logEvent(event, context, "ShareClassManager:UpdateDepositRequest");
    const {
      poolId,
      scId: tokenId,
      //epoch: _epochIndex,
      investor: investorAddress,
      depositAssetId,
      pendingUserAssetAmount,
      queuedUserAssetAmount,
      pendingTotalAssetAmount,
    } = event.args;

    const outstandingInvest = (await OutstandingInvestService.getOrInit(
      context,
      {
        poolId,
        tokenId,
        assetId: depositAssetId,
        account: investorAddress.substring(0, 42) as `0x${string}`,
      }
    )) as OutstandingInvestService;
    await outstandingInvest
      .decorateOutstandingOrder(event)
      .processHubDepositRequest(queuedUserAssetAmount, pendingUserAssetAmount)
      .computeTotalOutstandingAmount()
      .save();

    const epochOutstandingInvest =
      (await EpochOutstandingInvestService.getOrInit(context, {
        poolId,
        tokenId,
        assetId: depositAssetId,
      })) as EpochOutstandingInvestService;

    await epochOutstandingInvest
      .decorateEpochOutstandingInvest(event)
      .updatePendingAmount(pendingTotalAssetAmount)
      .save();
    console.log("-OODEBUG");
  }
);

ponder.on(
  "ShareClassManager:UpdateRedeemRequest",
  async ({ event, context }) => {
    console.log("OODEBUG-");
    logEvent(event, context, "ShareClassManager:UpdateRedeemRequest");
    const {
      poolId,
      scId: tokenId,
      //epoch: epochIndex,
      investor: investorAddress,
      payoutAssetId,
      pendingUserShareAmount,
      pendingTotalShareAmount,
      queuedUserShareAmount,
    } = event.args;
    const oo = (await OutstandingRedeemService.getOrInit(context, {
      poolId,
      tokenId,
      assetId: payoutAssetId,
      account: investorAddress.substring(0, 42) as `0x${string}`,
    })) as OutstandingRedeemService;
    await oo
      .decorateOutstandingOrder(event)
      .processHubRedeemRequest(queuedUserShareAmount, pendingUserShareAmount)
      .computeTotalOutstandingAmount()
      .save();

    const epochOutstandingRedeem =
      (await EpochOutstandingRedeemService.getOrInit(context, {
        poolId,
        tokenId,
        assetId: payoutAssetId,
      })) as EpochOutstandingRedeemService;

    await epochOutstandingRedeem
      .decorateEpochOutstandingRedeem(event)
      .updatePendingAmount(pendingTotalShareAmount)
      .save();
    console.log("-OODEBUG");
  }
);

ponder.on("ShareClassManager:ApproveDeposits", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:ApproveDeposits");
  console.log("OODEBUG-");
  const {
    poolId,
    scId: tokenId,
    epoch: epochIndex,
    depositAssetId,
    approvedAssetAmount,
    //approvedPoolAmount,
    pendingAssetAmount,
  } = event.args;

  const assetDecimals = await getAssetDecimals(context, depositAssetId);
  const approvedPercentage = computeApprovedPercentage(
    approvedAssetAmount,
    pendingAssetAmount,
    assetDecimals
  );

  const saves: Promise<InvestOrderService | OutstandingInvestService>[] = [];
  const oos = (await OutstandingInvestService.query(context, {
    tokenId,
    assetId: depositAssetId,
  })) as OutstandingInvestService[];

  for (const oo of oos) {
    const { account } = oo.read();
    const approvedUserAssetAmount = computeApprovedUserAmount(
      approvedAssetAmount,
      approvedPercentage,
      assetDecimals
    );
    if (approvedUserAssetAmount === 0n) {
      console.error(
        `Approved user asset amount is 0 for pool ${poolId} token ${tokenId} asset ${depositAssetId} account ${account} epoch ${epochIndex}`
      );
      continue;
    }
    const io = (await InvestOrderService.init(context, {
      poolId,
      tokenId,
      assetId: depositAssetId,
      index: epochIndex,
      account,
    })) as InvestOrderService;

    const ioOperation = io
      .approveDeposit(approvedUserAssetAmount, event.block)
      .save();
    saves.push(ioOperation);

    oo.processApprovedDeposit(
      approvedUserAssetAmount
    ).computeTotalOutstandingAmount();
    const { totalOutstandingAmount } = oo.read();
    if (totalOutstandingAmount === 0n) saves.push(oo.delete());
    else saves.push(oo.save());
  }
  await Promise.all(saves);
  console.log("-OODEBUG");
});

ponder.on("ShareClassManager:ApproveRedeems", async ({ event, context }) => {
  console.log("OODEBUG-");
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

  const saves: Promise<RedeemOrderService | OutstandingRedeemService>[] = [];
  const oos = (await OutstandingRedeemService.query(context, {
    tokenId,
  })) as OutstandingRedeemService[];
  for (const oo of oos) {
    const { account } = oo.read();
    const approvedUserShareAmount = computeApprovedUserAmount(
      approvedShareAmount,
      approvedPercentage,
      shareDecimals
    );
    if (approvedUserShareAmount === 0n) {
      console.error(
        `Approved user share amount is 0 for pool ${poolId} token ${tokenId} asset ${payoutAssetId} account ${account} epoch ${epochIndex}`
      );
      continue;
    }
    const io = (await RedeemOrderService.init(context, {
      poolId,
      tokenId,
      assetId: payoutAssetId,
      index: epochIndex,
      account,
    })) as RedeemOrderService;

    const ioOperation = io
      .approveRedeem(approvedUserShareAmount, event.block)
      .save();
    saves.push(ioOperation);

    oo.processApprovedRedeem(
      approvedUserShareAmount
    ).computeTotalOutstandingAmount();
    const { totalOutstandingAmount } = oo.read();
    if (totalOutstandingAmount === 0n) saves.push(oo.delete());
    else saves.push(oo.save());
  }
  await Promise.all(saves);
  console.log("-OODEBUG");
});

ponder.on("ShareClassManager:IssueShares", async ({ event, context }) => {
  console.log("OODEBUG-");
  logEvent(event, context, "ShareClassManager:IssueShares");
  const {
    //poolId,
    scId: tokenId,
    epoch: epochIndex,
    depositAssetId,
    navAssetPerShare,
    navPoolPerShare,
    //issuedShareAmount,
  } = event.args;

  const assetDecimals = await getAssetDecimals(context, depositAssetId);

  const investOrders = (await InvestOrderService.query(context, {
    tokenId,
    assetId: depositAssetId,
    index: epochIndex,
  })) as InvestOrderService[];

  const investSaves: Promise<InvestOrderService>[] = [];
  for (const investOrder of investOrders) {
    const investOperation = investOrder
      .issueShares(
        navAssetPerShare,
        navPoolPerShare,
        assetDecimals,
        event.block
      )
      .save();
    investSaves.push(investOperation);
  }
  await Promise.all(investSaves);
  console.log("-OODEBUG");
});

ponder.on("ShareClassManager:RevokeShares", async ({ event, context }) => {
  console.log("OODEBUG-");
  logEvent(event, context, "ShareClassManager:RevokeShares");
  const {
    poolId,
    scId: tokenId,
    epoch: epochIndex,
    payoutAssetId,
    navAssetPerShare,
    navPoolPerShare,
    //revokedShareAmount,
    //revokedAssetAmount,
    //revokedPoolAmount,
  } = event.args;

  const pool = (await PoolService.get(context, {
    id: poolId,
  })) as PoolService;
  if (!pool) throw new Error(`Pool not found for id ${poolId}`);
  const { currency } = pool.read();
  if (!currency) throw new Error("Currency is required");

  const shareDecimals = await getAssetDecimals(context, currency);

  const redeemOrders = (await RedeemOrderService.query(context, {
    tokenId,
    assetId: payoutAssetId,
    index: epochIndex,
  })) as RedeemOrderService[];

  const redeemSaves: Promise<RedeemOrderService>[] = [];
  for (const redeemOrder of redeemOrders) {
    const redeemOperation = redeemOrder
      .revokeShares(
        navAssetPerShare,
        navPoolPerShare,
        shareDecimals,
        event.block
      )
      .save();
    redeemSaves.push(redeemOperation);
  }
  await Promise.all(redeemSaves);
  console.log("-OODEBUG");
});

ponder.on("ShareClassManager:UpdateShareClass", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:UpdateShareClass");
  const {
    //poolId: poolId,
    scId: tokenId,
    navPoolPerShare: tokenPrice,
  } = event.args;
  const token = (await TokenService.get(context, {
    id: tokenId,
  })) as TokenService;
  if (!token) throw new Error(`Token not found for id ${tokenId}`);
  await token.setTokenPrice(tokenPrice);
  await token.save();
  await snapshotter(
    context,
    event,
    "ShareClassManager:UpdateShareClass",
    [token],
    TokenSnapshot
  );
});

ponder.on("ShareClassManager:RemoteIssueShares", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:RemoteIssueShares");
  const {
    //poolId,
    scId: tokenId,
    issuedShareAmount,
  } = event.args;
  const token = (await TokenService.get(context, {
    id: tokenId,
  })) as TokenService;
  if (!token) throw new Error(`Token not found for id ${tokenId}`);
  await token.increaseTotalSupply(issuedShareAmount);
  await token.save();
  await snapshotter(
    context,
    event,
    "ShareClassManager:RemoteIssueShares",
    [token],
    TokenSnapshot
  );
});

ponder.on(
  "ShareClassManager:RemoteRevokeShares",
  async ({ event, context }) => {
    logEvent(event, context, "ShareClassManager:RemoteRevokeShares");
    const {
      //centrifugeId,
      //poolId,
      scId: tokenId,
      revokedShareAmount,
    } = event.args;
    const token = (await TokenService.get(context, {
      id: tokenId,
    })) as TokenService;
    if (!token) throw new Error(`Token not found for id ${tokenId}`);
    await token.decreaseTotalSupply(revokedShareAmount);
    await token.save();
    await snapshotter(
      context,
      event,
      "ShareClassManager:RemoteRevokeShares",
      [token],
      TokenSnapshot
    );
  }
);

ponder.on("ShareClassManager:ClaimDeposit", async ({ event, context }) => {
  console.log("OODEBUG-");
  logEvent(event, context, "ShareClassManager:ClaimDeposit");
  const {
    //poolId,
    scId: tokenId,
    epoch: epochIndex,
    investor: investorAccount,
    depositAssetId: assetId,
    //paymentAssetAmount,
    //pendingAssetAmount,
    //claimedShareAmount,
    //issuedAt,
  } = event.args;

  const investOrder = (await InvestOrderService.get(context, {
    tokenId,
    assetId,
    account: investorAccount.substring(0, 42) as `0x${string}`,
    index: epochIndex,
  })) as InvestOrderService;
  if (!investOrder) {
    console.error(
      `Invest order not found for token ${tokenId} asset ${assetId} account ${investorAccount.substring(
        0,
        42
      )} index ${epochIndex}`
    );
    return;
  }
  await investOrder.claimDeposit(event.block).save();
  console.log("-OODEBUG");
});

ponder.on("ShareClassManager:ClaimRedeem", async ({ event, context }) => {
  console.log("OODEBUG-");
  logEvent(event, context, "ShareClassManager:ClaimRedeem");
  const {
    //poolId,
    scId: tokenId,
    epoch: epochIndex,
    investor: investorAccount,
    payoutAssetId: assetId,
    //paymentShareAmount,
    //pendingShareAmount,
    //claimedAssetAmount,
    //revokedAt,
  } = event.args;

  const redeemOrder = (await RedeemOrderService.get(context, {
    tokenId,
    assetId,
    account: investorAccount.substring(0, 42) as `0x${string}`,
    index: epochIndex,
  })) as RedeemOrderService;
  if (!redeemOrder) {
    console.error(
      `Redeem order not found for token ${tokenId} asset ${assetId} account ${investorAccount.substring(
        0,
        42
      )} index ${epochIndex}`
    );
    return;
  }
  await redeemOrder.claimRedeem(event.block).save();
  console.log("-OODEBUG");
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
