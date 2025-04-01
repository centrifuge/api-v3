import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { EpochService, PoolService, ShareClassService } from "../services";

// SHARE CLASS LIFECYCLE
ponder.on("MultiShareClass:AddedShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index)", async ({ event, context }) => {
  logEvent(event, "MultiShareClass:AddedShareClassShort");
  const { poolId, scId: shareClassId, index } = event.args;
  const shareClass = await ShareClassService.getOrInit(context, { id: shareClassId, poolId });
  await shareClass.setIndex(index);
  await shareClass.save();
});

ponder.on("MultiShareClass:AddedShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index, string name, string symbol, bytes32 salt)", async ({ event, context }) => {
  logEvent(event, "MultiShareClass:AddedShareClassLong");
  const { poolId, scId: shareClassId, index, name, symbol, salt } = event.args;
  const shareClass = await ShareClassService.getOrInit(context, { id: shareClassId, poolId });
  await shareClass.setIndex(index);
  await shareClass.setMetadata(name, symbol, salt);
  await shareClass.save();
});

// INVESTOR TRANSACTIONS
ponder.on("MultiShareClass:UpdatedMetadata", async ({ event, context }) => {
  logEvent(event, "MultiShareClass:UpdatedMetadata");
});

ponder.on("MultiShareClass:NewEpoch", async ({ event, context }) => {
  logEvent(event, "MultiShareClass:NewEpoch");
  const { poolId, newIndex } = event.args;
  const newEpoch = await EpochService.init(context, {
    poolId,
    index: newIndex,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  })
});

ponder.on("MultiShareClass:IssuedShares", async ({ event, context }) => {
  logEvent(event, "MultiShareClass:IssuedShares"); 
  const { poolId, scId: shareClassId, epoch: epochIndex, nav, navPerShare, newTotalIssuance, issuedShareAmount } = event.args;
  
  const pool = await PoolService.get(context, { id: poolId });
  if (!pool) throw new Error(`Pool not found for id ${poolId}`);

  const shareClass = await ShareClassService.get(context, { id: shareClassId, poolId });
  if (!shareClass) throw new Error(`ShareClass not found for id ${shareClassId}`);

  const epoch = await EpochService.get(context, { poolId, index: epochIndex });
  if (!epoch) throw new Error(`Epoch not found for pool ${poolId}, index ${epochIndex}`);
  await epoch.close(context, event.block);
  await epoch.save();
  
  await pool.setCurrentEpochIndex(epochIndex + 1);
  await pool.save();
  // TODO: Create InvestorTransactions DEPOSIT_REQUEST_EXECUTED
});

ponder.on("MultiShareClass:UpdatedDepositRequest", async ({ event, context }) => {
  logEvent(event, "MultiShareClass:UpdatedDepositRequest");

  // TODO: Create InvestorTransaction
  // TODO: Create OutstandingOrder
});

ponder.on("MultiShareClass:UpdatedRedeemRequest", async ({ event, context }) => {
  logEvent(event, "MultiShareClass:UpdatedRedeemRequest");

  // TODO: Create InvestorTransaction
  // TODO: Create OutstandingOrder
});

ponder.on("MultiShareClass:ApprovedDeposits", async ({ event, context }) => {
  logEvent(event, "MultiShareClass:ApprovedDeposits");

  // TODO: Create InvestorTransaction
  // TODO: Flush OutstandingOrder
});

ponder.on("MultiShareClass:ApprovedRedeems", async ({ event, context }) => {
  logEvent(event, "MultiShareClass:ApprovedRedeems");

  // TODO: Create InvestorTransaction
  // TODO: Flush OutstandingOrder
});










