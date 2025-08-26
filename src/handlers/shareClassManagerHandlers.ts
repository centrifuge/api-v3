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
  AccountService,
} from "../services";
import { snapshotter } from "../helpers/snapshotter";
import { TokenSnapshot } from "ponder:schema";
import { EpochOutstandingRedeemService } from "../services/EpochOutstandingRedeemService";
import { getAddress } from "viem";

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

    const _token = (await TokenService.upsert(context, {
      id: tokenId,
      poolId,
      centrifugeId,
      isActive: true,
      index,
    })) as TokenService;
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

    const _token = (await TokenService.upsert(context, {
      id: tokenId,
      poolId,
      centrifugeId,
      name,
      symbol,
      salt,
      isActive: true,
      index,
    })) as TokenService;
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

    const investorAccount = (await AccountService.getOrInit(context, {
      address: getAddress(investor.substring(0, 42)),
      createdAt: new Date(Number(event.block.timestamp) * 1000),
      createdAtBlock: Number(event.block.number),
    })) as AccountService;
    const { address: investorAddress } = investorAccount.read();

    const outstandingInvest = (await OutstandingInvestService.getOrInit(
      context,
      {
        poolId,
        tokenId,
        assetId: depositAssetId,
        account: investorAddress,
      }
    )) as OutstandingInvestService;
    await outstandingInvest
      .decorateOutstandingOrder(event)
      .processHubDepositRequest(queuedUserAssetAmount, pendingUserAssetAmount)
      .saveOrClear();

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

    const investorAccount = (await AccountService.getOrInit(context, {
      address: getAddress(investor.substring(0, 42)),
      createdAt: new Date(Number(event.block.timestamp) * 1000),
      createdAtBlock: Number(event.block.number),
    })) as AccountService;
    const { address: investorAddress } = investorAccount.read();

    const oo = (await OutstandingRedeemService.getOrInit(context, {
      poolId,
      tokenId,
      assetId: payoutAssetId,
      account: investorAddress,
    })) as OutstandingRedeemService;
    await oo
      .decorateOutstandingOrder(event)
      .processHubRedeemRequest(queuedUserShareAmount, pendingUserShareAmount)
      .saveOrClear();

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
  }
);

ponder.on("ShareClassManager:ApproveDeposits", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:ApproveDeposits");
  const {
    //poolId,
    scId: tokenId,
    //epoch: epochIndex,
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
    const { pendingAmount } = oo.read();
    const approvedUserAssetAmount = computeApprovedUserAmount(
      pendingAmount!,
      approvedPercentage,
      assetDecimals
    );
    oo.approveInvest(approvedUserAssetAmount, event.block);
    saves.push(oo.save());
  }
  await Promise.all(saves);
});

ponder.on("ShareClassManager:ApproveRedeems", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:ApproveRedeems");
  const {
    poolId,
    scId: tokenId,
    //epoch: epochIndex,
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
    assetId: payoutAssetId,
  })) as OutstandingRedeemService[];
  for (const oo of oos) {
    const { pendingAmount } = oo.read();
    const approvedUserShareAmount = computeApprovedUserAmount(
      pendingAmount!,
      approvedPercentage,
      shareDecimals
    );
    oo.approveRedeem(approvedUserShareAmount, event.block);
    saves.push(oo.save());
  }
  await Promise.all(saves);
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
    //issuedShareAmount,
  } = event.args;

  const assetDecimals = await getAssetDecimals(context, depositAssetId);

  const outstandingInvests = (await OutstandingInvestService.query(context, {
    tokenId,
    assetId: depositAssetId,
    approvedAmount_not: 0n,
  })) as OutstandingInvestService[];

  const outstandingInvestSaves: Promise<OutstandingInvestService>[] = [];
  const investOrderSaves: Promise<InvestOrderService>[] = [];
  for (const outstandingInvest of outstandingInvests) {
    const {
      poolId,
      tokenId,
      assetId,
      account,
      approvedAmount,
      approvedAt,
      approvedAtBlock,
    } = outstandingInvest.read();
    const investOrder = (await InvestOrderService.getOrInit(context, {
      poolId,
      tokenId,
      assetId,
      index: epochIndex,
      account,
      approvedAssetsAmount: approvedAmount,
      approvedAt,
      approvedAtBlock,
    })) as InvestOrderService;
    investOrder.issueShares(
      navAssetPerShare,
      navPoolPerShare,
      assetDecimals,
      event.block
    );
    investOrderSaves.push(investOrder.save());
    outstandingInvestSaves.push(outstandingInvest.clear());
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

  const outstandingRedeems = (await OutstandingRedeemService.query(context, {
    tokenId,
    assetId: payoutAssetId,
    approvedAmount_not: 0n,
  })) as OutstandingRedeemService[];

  const outstandingRedeemSaves: Promise<OutstandingRedeemService>[] = [];
  const redeemOrderSaves: Promise<RedeemOrderService>[] = [];
  for (const outstandingRedeem of outstandingRedeems) {
    const redeemOrder = (await RedeemOrderService.getOrInit(context, {
      poolId,
      tokenId,
      assetId: payoutAssetId,
      index: epochIndex,
      account: outstandingRedeem.read().account,
    })) as RedeemOrderService;
    redeemOrder.revokeShares(
      navAssetPerShare,
      navPoolPerShare,
      shareDecimals,
      event.block
    );
    outstandingRedeemSaves.push(outstandingRedeem.clear());
    redeemOrderSaves.push(redeemOrder.save());
  }
  await Promise.all([...outstandingRedeemSaves, ...redeemOrderSaves]);
});

ponder.on("ShareClassManager:UpdateShareClass", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:UpdateShareClass");
  const {
    poolId,
    scId: tokenId,
    navPoolPerShare: tokenPrice,
  } = event.args;

  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
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

  const investorAccount = (await AccountService.getOrInit(context, {
    address: getAddress(investor.substring(0, 42)),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
  })) as AccountService;
  const { address: investorAddress } = investorAccount.read();

  const investOrder = (await InvestOrderService.get(context, {
    tokenId,
    assetId,
    account: investorAddress,
    index: epochIndex,
  })) as InvestOrderService;
  if (!investOrder) {
    console.log(
      `Invest order not found for token ${tokenId} asset ${assetId} account ${investorAddress} index ${epochIndex}`
    );
    return;
  }
  await investOrder.claimDeposit(event.block).save();
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

  const investorAccount = (await AccountService.getOrInit(context, {
    address: getAddress(investor.substring(0, 42)),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
  })) as AccountService;
  const { address: investorAddress } = investorAccount.read();

  const redeemOrder = (await RedeemOrderService.get(context, {
    tokenId,
    assetId,
    account: investorAddress,
    index: epochIndex,
  })) as RedeemOrderService;
  if (!redeemOrder) {
    console.log(
      `Redeem order not found for token ${tokenId} asset ${assetId} account ${investorAddress} index ${epochIndex}`
    );
    return;
  }
  await redeemOrder.claimRedeem(event.block).save();
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
