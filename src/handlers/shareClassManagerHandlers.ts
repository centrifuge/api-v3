import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import {
  EpochService,
  PoolService,
  TokenService,
  OutstandingOrderService,
  InvestorTransactionService,
  BlockchainService,
} from "../services";
import { snapshotter } from "../helpers/snapshotter";
import { TokenSnapshot } from "ponder:schema";

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
    const {
      poolId,
      scId: tokenId,
      index,
      name,
      symbol,
      salt,
    } = event.args;

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
      pendingTotalAssetAmount,
    } = event.args;

    const oo = (await OutstandingOrderService.getOrInit(context, {
      poolId,
      tokenId,
      account: investorAddress,
    })) as OutstandingOrderService;
    await oo.decorateOutstandingOrder(updatedAt, updatedAtBlock);
    await oo.updateRequestedDepositAmount(pendingUserAssetAmount);
    await oo.save();
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
    } = event.args;
    const oo = await OutstandingOrderService.getOrInit(context, {
      poolId,
      tokenId,
      account: investorAddress,
    }) as OutstandingOrderService;
    await oo.decorateOutstandingOrder(updatedAt, updatedAtBlock);
    await oo.updateRequestedRedeemAmount(pendingUserShareAmount);
    await oo.save();
  }
);

ponder.on("ShareClassManager:ApproveDeposits", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:ApproveDeposits");
  const {
    poolId,
    scId: tokenId,
    epoch: epochIndex,
    depositAssetId,
    approvedPoolAmount,
    approvedAssetAmount,
    pendingAssetAmount,
  } = event.args;
  const saves: Promise<OutstandingOrderService>[] = [];
  const oos = await OutstandingOrderService.query(context, {
    tokenId,
  }) as OutstandingOrderService[];
  for (const oo of oos) {
    await oo.computeApprovedDepositAmount(
      approvedAssetAmount,
      pendingAssetAmount
    );
    saves.push(oo.save());
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
  const saves: Promise<OutstandingOrderService>[] = [];
  const oos = await OutstandingOrderService.query(context, {
    tokenId,
  }) as OutstandingOrderService[];
  for (const oo of oos) {
    await oo.computeApprovedRedeemAmount(
      approvedShareAmount,
      pendingShareAmount
    );
    saves.push(oo.save());
  }
  await Promise.all(saves);
});

ponder.on("ShareClassManager:IssueShares", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:IssueShares");
  const {
    poolId,
    scId: tokenId,
    epoch: epochIndex,
    // nav,
    // navPerShare,
    // newTotalIssuance,
    issuedShareAmount,
  } = event.args;

  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");


  const blockchain = await BlockchainService.get(context, {
    id: chainId.toString(),
  });
  const { centrifugeId } = blockchain.read();

  const pool = await PoolService.get(context, { id: poolId }) as PoolService;
  if (!pool) throw new Error(`Pool not found for id ${poolId}`);

  const token = await TokenService.get(context, {
    id: tokenId,
  });
  if (!token)
    throw new Error(`Token not found for id ${tokenId}`);

  const epoch = await EpochService.get(context, { poolId, index: epochIndex }) as EpochService;
  if (!epoch)
    throw new Error(`Epoch not found for pool ${poolId}, index ${epochIndex}`);
  await epoch.close(context, event.block);
  await epoch.save();

  const nextEpochIndex = epochIndex + 1;
  const newEpoch = await EpochService.init(context, {
    poolId: poolId,
    index: nextEpochIndex,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  }) as EpochService;

  await pool.setCurrentEpochIndex(nextEpochIndex);
  await pool.save();

  const baseTransactionData = {
    poolId: poolId,
    tokenId: tokenId,
    epochIndex,
    txHash: event.transaction.hash,
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
    centrifugeId,
  };

  const oos = await OutstandingOrderService.query(context, {
    tokenId,
  }) as OutstandingOrderService[];

  for (const oo of oos) {
    const { account, approvedDepositAmount, approvedRedeemAmount } = oo.read();
    if (approvedDepositAmount && approvedDepositAmount > 0n) {
      await InvestorTransactionService.executeDepositRequest(context, {
        ...baseTransactionData,
        account: account.substring(0, 42),
        currencyAmount: approvedDepositAmount,
      });
    }
    if (approvedRedeemAmount && approvedRedeemAmount > 0n) {
      await InvestorTransactionService.executeRedeemRequest(context, {
        ...baseTransactionData,
        account: account.substring(0, 42),
        tokenAmount: approvedRedeemAmount,
      });
    }
    await oo.executeRequests();
    const { requestedRedeemAmount, requestedDepositAmount } = oo.read();
    if (requestedRedeemAmount! === 0n && requestedDepositAmount! === 0n) {
      await oo.clear();
    } else {
      await oo.save();
    }
  }
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
  const token = await TokenService.get(context, {
    id: tokenId,
  }) as TokenService;
  if (!token) throw new Error(`Token not found for id ${tokenId}`);
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
  }) as TokenService;
  if (!token) throw new Error(`Token not found for id ${tokenId}`);
  await token.increaseTotalSupply(issuedShareAmount);
  await token.save();
  await snapshotter(context, event, "ShareClassManager:RemoteIssueShares", [token], TokenSnapshot)
});

ponder.on("ShareClassManager:RemoteRevokeShares", async ({ event, context }) => {
  logEvent(event, context, "ShareClassManager:RemoteRevokeShares");
  const {
    poolId: _poolId,
    scId: _tokenId,
    revokedShareAmount,
  } = event.args;
  const poolId = _poolId;
  const tokenId = _tokenId.toString();
  const token = await TokenService.get(context, {
    id: tokenId,
  }) as TokenService;
  if (!token) throw new Error(`Token not found for id ${tokenId}`);
  await token.decreaseTotalSupply(revokedShareAmount);
  await token.save();
  await snapshotter(context, event, "ShareClassManager:RemoteRevokeShares", [token], TokenSnapshot)
});