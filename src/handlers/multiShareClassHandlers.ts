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
  "MultiShareClass:AddedShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index)",
  async ({ event, context }) => {
    logEvent(event, "MultiShareClass:AddedShareClassShort");
    const { poolId, scId: shareClassId, index } = event.args;
    const shareClass = await ShareClassService.getOrInit(context, {
      id: shareClassId,
      poolId,
    }) as ShareClassService;
    await shareClass.setIndex(index);
    await shareClass.save();
  }
);

ponder.on(
  "MultiShareClass:AddedShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index, string name, string symbol, bytes32 salt)",
  async ({ event, context }) => {
    logEvent(event, "MultiShareClass:AddedShareClassLong");
    const {
      poolId,
      scId: shareClassId,
      index,
      name,
      symbol,
      salt,
    } = event.args;
    const shareClass = await ShareClassService.getOrInit(context, {
      id: shareClassId,
      poolId,
    }) as ShareClassService;
    await shareClass.setIndex(index);
    await shareClass.setMetadata(name, symbol, salt);
    await shareClass.save();
  }
);

// INVESTOR TRANSACTIONS
ponder.on("MultiShareClass:UpdatedMetadata", async ({ event, context }) => {
  logEvent(event, "MultiShareClass:UpdatedMetadata");
  const { poolId, scId: shareClassId, name, symbol, salt } = event.args;
  const shareClass = await ShareClassService.getOrInit(context, {
    id: shareClassId,
    poolId,
  }) as ShareClassService;
  await shareClass.setMetadata(name, symbol, salt);
  await shareClass.save();
});

ponder.on("MultiShareClass:NewEpoch", async ({ event, context }) => {
  logEvent(event, "MultiShareClass:NewEpoch");
  const { poolId, newIndex } = event.args;
  const newEpoch = await EpochService.init(context, {
    poolId,
    index: newIndex,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  }) as EpochService;
});

ponder.on(
  "MultiShareClass:UpdatedDepositRequest",
  async ({ event, context }) => {
    logEvent(event, "MultiShareClass:UpdatedDepositRequest");
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
      poolId,
      shareClassId,
      account: investor,
    }) as OutstandingOrderService;
    await oo.decorateOutstandingOrder(updatedAt, updatedAtBlock);
    await oo.updateRequestedDepositAmount(updatedAmountUser);
    await oo.save();
  }
);

ponder.on(
  "MultiShareClass:UpdatedRedeemRequest",
  async ({ event, context }) => {
    logEvent(event, "MultiShareClass:UpdatedRedeemRequest");
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
      poolId,
      shareClassId,
      account: investor,
    }) as OutstandingOrderService;
    await oo.decorateOutstandingOrder(updatedAt, updatedAtBlock);
    await oo.updateRequestedRedeemAmount(updatedAmountUser);
    await oo.save();
  }
);

ponder.on("MultiShareClass:ApprovedDeposits", async ({ event, context }) => {
  logEvent(event, "MultiShareClass:ApprovedDeposits");
  const {
    poolId,
    scId: shareClassId,
    epoch: epochIndex,
    assetId,
    approvedPoolAmount,
    approvedAssetAmount,
    pendingAssetAmount,
  } = event.args;
  const saves: Promise<OutstandingOrderService>[] = [];
  const oos = await OutstandingOrderService.query(context, {
    poolId,
    shareClassId,
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

ponder.on("MultiShareClass:ApprovedRedeems", async ({ event, context }) => {
  logEvent(event, "MultiShareClass:ApprovedRedeems");
  const {
    poolId,
    scId: shareClassId,
    epoch: epochIndex,
    assetId,
    approvedShareClassAmount,
    pendingShareClassAmount,
  } = event.args;
  const saves: Promise<OutstandingOrderService>[] = [];
  const oos = await OutstandingOrderService.query(context, {
    poolId,
    shareClassId,
  }) as OutstandingOrderService[];
  for (const oo of oos) {
    await oo.computeApprovedRedeemAmount(
      approvedShareClassAmount,
      pendingShareClassAmount
    );
    saves.push(oo.save());
  }
  await Promise.all(saves);
});

ponder.on("MultiShareClass:IssuedShares", async ({ event, context }) => {
  logEvent(event, "MultiShareClass:IssuedShares");
  const {
    poolId,
    scId: shareClassId,
    epoch: epochIndex,
    nav,
    navPerShare,
    newTotalIssuance,
    issuedShareAmount,
  } = event.args;
  const nextEpochIndex = epochIndex + 1;

  const pool = await PoolService.get(context, { id: poolId }) as PoolService;
  if (!pool) throw new Error(`Pool not found for id ${poolId}`);

  const shareClass = await ShareClassService.get(context, {
    id: shareClassId,
    poolId,
  });
  if (!shareClass)
    throw new Error(`ShareClass not found for id ${shareClassId}`);

  const epoch = await EpochService.get(context, { poolId, index: epochIndex }) as EpochService;
  if (!epoch)
    throw new Error(`Epoch not found for pool ${poolId}, index ${epochIndex}`);
  await epoch.close(context, event.block);
  await epoch.save();

  await pool.setCurrentEpochIndex(nextEpochIndex);
  await pool.save();

  const baseTransactionData = {
    poolId,
    shareClassId,
    epochIndex,
    txHash: event.transaction.hash,
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
  };

  const oos = await OutstandingOrderService.query(context, {
    poolId,
    shareClassId,
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
