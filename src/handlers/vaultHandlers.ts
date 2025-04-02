import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { PoolService, ShareClassService } from "../services";
import { ShareClass } from "ponder:schema";
import { InvestorTransactionService } from "../services/InvestorTransactionService";

ponder.on("Vault:DepositRequest", async ({ event, context }) => {
  logEvent(event, "Vault:DepositRequest");
  const { controller, owner, requestId, sender, assets } = event.args;
  const vault = event.transaction.to;

  const shareClass = (await ShareClassService.query(context, { vault })).pop();
  if (!shareClass) throw new Error(`ShareClass with vault ${vault} not found`);
  const { poolId, id: shareClassId } = shareClass.read();

  const pool = await PoolService.get(context, { id: poolId });
  if (!pool) throw new Error(`Pool with id ${poolId} not found`);
  const { currentEpochIndex } = pool.read();

  const it = await InvestorTransactionService.updateDepositRequest(context, {
    poolId,
    shareClassId,
    account: sender,
    currencyAmount: assets,
    createdAt: new Date(),
    txHash: event.transaction.hash,
    epochIndex: currentEpochIndex!,
    createdAtBlock: Number(event.block.number),
  });
});

ponder.on("Vault:RedeemRequest", async ({ event, context }) => {
  logEvent(event, "Vault:RedeemRequest");
  const { controller, owner, requestId, sender, assets } = event.args;
  const vault = event.transaction.to;

  const shareClass = (await ShareClassService.query(context, { vault })).pop();
  if (!shareClass) throw new Error(`ShareClass with vault ${vault} not found`);
  const { poolId, id: shareClassId } = shareClass.read();

  const pool = await PoolService.get(context, { id: poolId });
  if (!pool) throw new Error(`Pool with id ${poolId} not found`);
  const { currentEpochIndex } = pool.read();

  const it = await InvestorTransactionService.updateRedeemRequest(context, {
    poolId,
    shareClassId,
    account: sender,
    tokenAmount: assets,
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    txHash: event.transaction.hash,
    epochIndex: currentEpochIndex!,
    createdAtBlock: Number(event.block.number),
  });
});

ponder.on("Vault:Deposit", async ({ event, context }) => {
  logEvent(event, "Vault:Deposit");
  const { sender, owner, assets, shares } = event.args;
  const vault = event.transaction.to;

  const shareClass = (await ShareClassService.query(context, { vault })).pop();
  if (!shareClass) throw new Error(`ShareClass with vault ${vault} not found`);
  const { poolId, id: shareClassId } = shareClass.read();

  const pool = await PoolService.get(context, { id: poolId });
  if (!pool) throw new Error(`Pool with id ${poolId} not found`);
  const { currentEpochIndex } = pool.read();

  const it = await InvestorTransactionService.claimDeposit(context, {
    poolId,
    shareClassId,
    account: sender,
    tokenAmount: shares,
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    txHash: event.transaction.hash,
    epochIndex: currentEpochIndex!,
    createdAtBlock: Number(event.block.number),
  });
});

ponder.on("Vault:Withdraw", async ({ event, context }) => {
  logEvent(event, "Vault:Withdraw");
  const { sender, receiver, owner, assets, shares } = event.args;
  const vault = event.transaction.to;

  const shareClass = (await ShareClassService.query(context, { vault })).pop();
  if (!shareClass) throw new Error(`ShareClass with vault ${vault} not found`);
  const { poolId, id: shareClassId } = shareClass.read();

  const pool = await PoolService.get(context, { id: poolId });
  if (!pool) throw new Error(`Pool with id ${poolId} not found`);
  const { currentEpochIndex } = pool.read();

  const it = await InvestorTransactionService.claimRedeem(context, {
    poolId,
    shareClassId,
    account: receiver,
    tokenAmount: shares,
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    txHash: event.transaction.hash,
    epochIndex: currentEpochIndex!,
    createdAtBlock: Number(event.block.number),
  });
});