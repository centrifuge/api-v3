import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { PoolService, TokenService } from "../services";
import { InvestorTransactionService, VaultService } from "../services";

ponder.on("Vault:DepositRequest", async ({ event, context }) => {
  logEvent(event, "Vault:DepositRequest");
  const {
    controller,
    owner,
    requestId,
    sender: senderAddress,
    assets,
  } = event.args;
  const vaultId = event.log.address.toString();
  if (!vaultId) throw new Error(`Vault id not found in event`);
  const vault = (await VaultService.get(context, {
    id: vaultId,
  })) as VaultService;

  const { poolId, tokenId } = vault.read();
  const token = await TokenService.get(context, {
    poolId: poolId,
    id: tokenId,
  });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const pool = await PoolService.get(context, { id: poolId });
  if (!pool) throw new Error(`Pool with id ${poolId} not found`);
  const { currentEpochIndex } = pool.read();

  const it = await InvestorTransactionService.updateDepositRequest(context, {
    poolId,
    tokenId,
    account: senderAddress,
    currencyAmount: assets,
    createdAt: new Date(),
    txHash: event.transaction.hash,
    epochIndex: currentEpochIndex!,
    createdAtBlock: Number(event.block.number),
  });
});

ponder.on("Vault:RedeemRequest", async ({ event, context }) => {
  logEvent(event, "Vault:RedeemRequest");
  const {
    controller,
    owner,
    requestId,
    sender: senderAddress,
    assets,
  } = event.args;
  const vaultId = event.log.address.toString();
  if (!vaultId) throw new Error(`Vault id not found in event`);
  const vault = await VaultService.get(context, { id: vaultId });

  const { poolId, tokenId } = vault.read();
  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const pool = await PoolService.get(context, { id: poolId });
  if (!pool) throw new Error(`Pool with id ${poolId} not found`);
  const { currentEpochIndex } = pool.read();

  const it = await InvestorTransactionService.updateRedeemRequest(context, {
    poolId,
    tokenId,
    account: senderAddress,
    currencyAmount: assets,
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    txHash: event.transaction.hash,
    epochIndex: currentEpochIndex!,
    createdAtBlock: Number(event.block.number),
  });
});

ponder.on("Vault:Deposit", async ({ event, context }) => {
  logEvent(event, "Vault:Deposit");
  const { sender: senderAddress, owner, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`Vault id not found in event`);
  const vault = await VaultService.get(context, { id: vaultId });
  const { poolId, tokenId, kind } = vault.read();

  if (kind === "Async") return;

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const it = await InvestorTransactionService.syncDeposit(context, {
    poolId,
    tokenId,
    account: senderAddress,
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice: getTokenPrice(shares, assets),
    txHash: event.transaction.hash,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  });
});

ponder.on("Vault:Withdraw", async ({ event, context }) => {
  logEvent(event, "Vault:Withdraw");
  const {
    sender: senderAddress,
    receiver: receiverAddress,
    owner,
    assets,
    shares,
  } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`Vault id not found in event`);
  const vault = await VaultService.get(context, { id: vaultId });
  const { kind } = vault.read();

  if (kind !== "Sync") return;

  const { poolId, tokenId } = vault.read();
  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const it = await InvestorTransactionService.syncRedeem(context, {
    poolId,
    tokenId,
    account: receiverAddress,
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice: getTokenPrice(shares, assets),
    txHash: event.transaction.hash,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  });
});

function getTokenPrice(tokenAmount: bigint, currencyAmount: bigint) {
  return (currencyAmount * 10n ** 18n) / tokenAmount;
}
