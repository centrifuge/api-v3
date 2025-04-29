import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import {
  EpochService,
  PoolService,
  ShareClassService,
  OutstandingOrderService,
  InvestorTransactionService,
} from "../services";

// SHARE CLASS LIFECYCLE
ponder.on(
  "ShareClassManager:AddShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index)",
  async ({ event, context }) => {
    logEvent(event, "ShareClassManager:AddShareClassShort");
    const { poolId, scId: shareClassId, index } = event.args;
    const shareClass = await ShareClassService.getOrInit(context, {
      id: shareClassId.toString(),
      poolId: poolId.toString(),
    }) as ShareClassService;
    await shareClass.setIndex(index);
    await shareClass.save();
  }
);

ponder.on(
  "ShareClassManager:AddShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index, string name, string symbol, bytes32 salt)",
  async ({ event, context }) => {
    logEvent(event, "ShareClassManager:AddShareClassLong");
    const {
      poolId,
      scId: shareClassId,
      index,
      name,
      symbol,
      salt,
    } = event.args;
    const shareClass = await ShareClassService.getOrInit(context, {
      id: shareClassId.toString(),
      poolId: poolId.toString(),
    }) as ShareClassService;
    await shareClass.setIndex(index);
    await shareClass.setMetadata(name, symbol);
    await shareClass.save();
  }
);

// INVESTOR TRANSACTIONS
ponder.on("ShareClassManager:UpdateMetadata", async ({ event, context }) => {
  logEvent(event, "ShareClassManager:UpdatedMetadata");
  const { poolId, scId: shareClassId, name, symbol } = event.args;
  const shareClass = await ShareClassService.getOrInit(context, {
    id: shareClassId,
    poolId: poolId.toString(),
  }) as ShareClassService;
  await shareClass.setMetadata(name, symbol);
  await shareClass.save();
});

ponder.on("ShareClassManager:NewEpoch", async ({ event, context }) => {
  logEvent(event, "ShareClassManager:NewEpoch");
  const { poolId, newIndex } = event.args;
  const newEpoch = await EpochService.init(context, {
    poolId: poolId.toString(),
    index: newIndex,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  }) as EpochService;
});

ponder.on(
  "ShareClassManager:UpdateDepositRequest",
  async ({ event, context }) => {
    logEvent(event, "ShareClassManager:UpdateDepositRequest");
    const updatedAt = new Date(Number(event.block.timestamp) * 1000);
    const updatedAtBlock = Number(event.block.number);
    const {
      poolId,
      scId: shareClassId,
      epoch: epochIndex,
      investor,
      assetId,
      updatedAmountUser,
      updatedAmountTotal,
    } = event.args;
    const oo = await OutstandingOrderService.getOrInit(context, {
      poolId: poolId.toString(),
      shareClassId: shareClassId.toString(),
      account: investor.toString(),
    }) as OutstandingOrderService;
    await oo.decorateOutstandingOrder(updatedAt, updatedAtBlock);
    await oo.updateRequestedDepositAmount(updatedAmountUser);
    await oo.save();
  }
);

ponder.on(
  "ShareClassManager:UpdateRedeemRequest",
  async ({ event, context }) => {
    logEvent(event, "ShareClassManager:UpdateRedeemRequest");
    const updatedAt = new Date(Number(event.block.timestamp) * 1000);
    const updatedAtBlock = Number(event.block.number);
    const {
      poolId,
      scId: shareClassId,
      epoch: epochIndex,
      investor,
      payoutAssetId,
      updatedAmountUser,
      updatedAmountTotal,
    } = event.args;
    const oo = await OutstandingOrderService.getOrInit(context, {
      poolId: poolId.toString() ,
      shareClassId: shareClassId.toString(),
      account: investor.toString(),
    }) as OutstandingOrderService;
    await oo.decorateOutstandingOrder(updatedAt, updatedAtBlock);
    await oo.updateRequestedRedeemAmount(updatedAmountUser);
    await oo.save();
  }
);

ponder.on("ShareClassManager:ApproveDeposits", async ({ event, context }) => {
  logEvent(event, "ShareClassManager:ApproveDeposits");
  const {
    poolId,
    scId: shareClassId,
    epoch: epochIndex,
    depositAssetId,
    approvedPoolAmount,
    approvedAssetAmount,
    pendingAssetAmount,
  } = event.args;
  const saves: Promise<OutstandingOrderService>[] = [];
  const oos = await OutstandingOrderService.query(context, {
    poolId: poolId.toString(),
    shareClassId: shareClassId.toString(),
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
  logEvent(event, "ShareClassManager:ApproveRedeems");
  const {
    poolId,
    scId: shareClassId,
    epoch: epochIndex,
    payoutAssetId,
    approvedShareAmount,
    pendingShareAmount,
  } = event.args;
  const saves: Promise<OutstandingOrderService>[] = [];
  const oos = await OutstandingOrderService.query(context, {
    poolId: poolId.toString(),
    shareClassId: shareClassId.toString(),
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
  logEvent(event, "ShareClassManager:IssueShares");
  const {
    poolId,
    scId: shareClassId,
    epoch: epochIndex,
    // nav,
    // navPerShare,
    // newTotalIssuance,
    // issuedShareAmount,
  } = event.args;
  const nextEpochIndex = epochIndex + 1;

  const pool = await PoolService.get(context, { id: poolId.toString() }) as PoolService;
  if (!pool) throw new Error(`Pool not found for id ${poolId}`);

  const shareClass = await ShareClassService.get(context, {
    id: shareClassId.toString(),
    poolId: poolId.toString(),
  });
  if (!shareClass)
    throw new Error(`ShareClass not found for id ${shareClassId}`);

  const epoch = await EpochService.get(context, { poolId: poolId.toString(), index: epochIndex }) as EpochService;
  if (!epoch)
    throw new Error(`Epoch not found for pool ${poolId}, index ${epochIndex}`);
  await epoch.close(context, event.block);
  await epoch.save();

  await pool.setCurrentEpochIndex(nextEpochIndex);
  await pool.save();

  const baseTransactionData = {
    poolId: poolId.toString(),
    shareClassId: shareClassId.toString(),
    epochIndex,
    txHash: event.transaction.hash,
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
  };

  const oos = await OutstandingOrderService.query(context, {
    poolId: poolId.toString(),
    shareClassId: shareClassId.toString(),
  }) as OutstandingOrderService[];

  for (const oo of oos) {
    const { account, approvedDepositAmount, approvedRedeemAmount } = oo.read();
    if (approvedDepositAmount && approvedDepositAmount > 0n) {
      await InvestorTransactionService.executeDepositRequest(context, {
        ...baseTransactionData,
        account,
        currencyAmount: approvedDepositAmount,
      });
    }
    if (approvedRedeemAmount && approvedRedeemAmount > 0n) {
      await InvestorTransactionService.executeRedeemRequest(context, {
        ...baseTransactionData,
        account,
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
