import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { PoolService, ShareClassService } from "../services";
import { ShareClass } from "ponder:schema";
import { InvestorTransactionService, VaultService } from "../services";

ponder.on("BaseVault:DepositRequest", async ({ event, context }) => {
  logEvent(event, "BaseVault:DepositRequest");
  const { controller, owner, requestId, sender, assets } = event.args;
  const vaultId = event.transaction.to;
  if (!vaultId) throw new Error(`Vault id not found in event`);
  const vault = await VaultService.get(context, { id: vaultId }) as VaultService;
  
  const { poolId, shareClassId } = vault.read();
  const shareClass = (await ShareClassService.get(context, { poolId: poolId,  id: shareClassId}));
  if (!shareClass) throw new Error(`ShareClass not found for vault ${vaultId}`);

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
  const vaultId = event.transaction.to;
  if (!vaultId) throw new Error(`Vault id not found in event`);
  const vault = await VaultService.get(context, { id: vaultId });
  
  const { poolId, shareClassId } = vault.read();
  const shareClass = (await ShareClassService.get(context, { poolId,  id: shareClassId}));
  if (!shareClass) throw new Error(`ShareClass not found for vault ${vaultId}`);

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
  const vaultId = event.transaction.to;
  if (!vaultId) throw new Error(`Vault id not found in event`);
  const vault = await VaultService.get(context, { id: vaultId });

  const { poolId, shareClassId } = vault.read();
  const shareClass = (await ShareClassService.get(context, { poolId,  id: shareClassId}));
  if (!shareClass) throw new Error(`ShareClass not found for vault ${vaultId}`);

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
    createdAtBlock: Number(event.block.number),
  });
});

ponder.on("Vault:Withdraw", async ({ event, context }) => {
  logEvent(event, "Vault:Withdraw");
  const { sender, receiver, owner, assets, shares } = event.args;
  const vaultId = event.transaction.to;
  if (!vaultId) throw new Error(`Vault id not found in event`);
  const vault = await VaultService.get(context, { id: vaultId });

  const { poolId, shareClassId } = vault.read();
  const shareClass = (await ShareClassService.get(context, { poolId,  id: shareClassId}));
  if (!shareClass) throw new Error(`ShareClass not found for vault ${vaultId}`);

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
    createdAtBlock: Number(event.block.number),
  });
});