import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import {
  TokenService,
  OutstandingInvestService,
  OutstandingRedeemService,
  BlockchainService,
  InvestOrderService,
  RedeemOrderService,
  EpochOutstandingInvestService,
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
    const updatedAt = new Date(Number(event.block.timestamp) * 1000);
    const updatedAtBlock = Number(event.block.number);
    const {
      poolId,
      scId: tokenId,
      epoch: epochIndex,
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
        account: investorAddress,
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
  }
);

ponder.on(
  "ShareClassManager:UpdateRedeemRequest",
  async ({ event, context }) => {
    logEvent(event, context, "ShareClassManager:UpdateRedeemRequest");
    const updatedAt = new Date(Number(event.block.timestamp) * 1000);
    const updatedAtBlock = Number(event.block.number);
    const {
      poolId,
      scId: tokenId,
      epoch: epochIndex,
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
      account: investorAddress,
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

  const approvedPercentageOfTotalPending =
    (approvedAssetAmount * 10n ** 18n) / (approvedAssetAmount + pendingAssetAmount);

  const saves: Promise<InvestOrderService>[] = [];
  const oos = (await OutstandingInvestService.query(context, {
    tokenId,
    assetId: depositAssetId,
  })) as OutstandingInvestService[];
  for (const oo of oos) {
    const { account } = oo.read();
    const io = (await InvestOrderService.init(context, {
      poolId,
      tokenId,
      assetId: depositAssetId,
      index: epochIndex,
      account,
    })) as InvestOrderService;
    saves.push(
      io
        .approveDeposit(
          approvedAssetAmount,
          approvedPercentageOfTotalPending,
          event.block
        )
        .save()
    );
    // TODO: handle unfulfilled portion
  }
  await Promise.all(saves);
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
  const saves: Promise<RedeemOrderService>[] = [];
  const oos = (await OutstandingRedeemService.query(context, {
    tokenId,
  })) as OutstandingRedeemService[];
  for (const oo of oos) {
    const approvedPercentageOfTotalPending =
      (approvedShareAmount * 10n ** 18n) / (approvedShareAmount + pendingShareAmount);
    const { account } = oo.read();
    const io = (await RedeemOrderService.init(context, {
      poolId,
      tokenId,
      assetId: payoutAssetId,
      index: epochIndex,
      account,
    })) as RedeemOrderService;
    saves.push(
      io
        .approveRedeem(
          approvedShareAmount,
          approvedPercentageOfTotalPending,
          event.block
        )
        .save()
    );
    // TODO: handle unfulfilled portion
  }
  await Promise.all(saves);
});

ponder.on("ShareClassManager:IssueShares", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:IssueShares");
  const {
    poolId,
    scId: tokenId,
    epoch: epochIndex,
    depositAssetId,
    navAssetPerShare,
    navPoolPerShare,
    issuedShareAmount,
  } = event.args;

  const investOrders = (await InvestOrderService.query(context, {
    tokenId,
    assetId: depositAssetId,
    index: epochIndex,
  })) as InvestOrderService[];

  const investSaves: Promise<InvestOrderService>[] = [];
  for (const investOrder of investOrders) {
    investSaves.push(
      investOrder.issueShares(navAssetPerShare, navPoolPerShare, event.block).save()
    );
  }

  await Promise.all(investSaves);
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

  const redeemOrders = (await RedeemOrderService.query(context, {
    tokenId,
    assetId: payoutAssetId,
    index: epochIndex,
  })) as RedeemOrderService[];

  const redeemSaves: Promise<RedeemOrderService>[] = [];
  for (const redeemOrder of redeemOrders) {
    redeemSaves.push(
      redeemOrder.revokeShares(navAssetPerShare, navPoolPerShare, event.block).save()
    );
  }
  await Promise.all(redeemSaves);
});

ponder.on("ShareClassManager:UpdateShareClass", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:UpdateShareClass");
  const {
    poolId: _poolId,
    scId: _tokenId,
    navPoolPerShare: tokenPrice,
  } = event.args;
  const poolId = _poolId;
  const tokenId = _tokenId.toString();
  const token = (await TokenService.get(context, {
    id: tokenId,
  })) as TokenService;
  if (!token) throw new Error(`Token not found for id ${tokenId}`);
  await snapshotter(
    context,
    event,
    "ShareClassManager:UpdateShareClass",
    [token],
    TokenSnapshot
  );
  await token.setTokenPrice(tokenPrice);
  await token.save();
  await snapshotter(context, event, "ShareClassManager:UpdateShareClass", [token], TokenSnapshot)
});

ponder.on("ShareClassManager:RemoteIssueShares", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:RemoteIssueShares");
  const {
    poolId: _poolId,
    scId: _tokenId,
    issuedShareAmount,
  } = event.args;
  const poolId = _poolId;
  const tokenId = _tokenId.toString();
  const token = await TokenService.get(context, {
    id: tokenId,
  })) as TokenService;
  if (!token) throw new Error(`Token not found for id ${tokenId}`);
  await snapshotter(
    context,
    event,
    "ShareClassManager:RemoteIssueShares",
    [token],
    TokenSnapshot
  );
  await token.increaseTotalSupply(issuedShareAmount);
  await token.save();
  await snapshotter(context, event, "ShareClassManager:RemoteIssueShares", [token], TokenSnapshot)
});

ponder.on("ShareClassManager:RemoteRevokeShares", async ({ event, context }) => {
  logEvent(event, "ShareClassManager:RemoteRevokeShares");
  const {
    poolId,
    scId: tokenId,
    epoch: epochIndex,
    investor: investorAccount,
    payoutAssetId: assetId,
    paymentShareAmount,
    pendingShareAmount,
    claimedAssetAmount,
    revokedAt,
  } = event.args;

  const redeemOrder = (await RedeemOrderService.get(context, {
    poolId,
    tokenId,
    assetId,
    account: investorAccount,
    index: epochIndex,
  })) as RedeemOrderService;

  await redeemOrder.claimRedeem(event.block).save()
})