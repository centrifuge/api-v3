import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { BlockchainService, PoolService, TokenService } from "../services";
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
  
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`Vault id not found in event`);
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  if (!vaultId) throw new Error(`Vault id not found in event`);
  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
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
    account: senderAddress.substring(0, 42),
    currencyAmount: assets,
    txHash: event.transaction.hash,
    epochIndex: currentEpochIndex!,
    createdAt: new Date(Number(event.block.timestamp) * 1000),
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
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`Vault id not found in event`);
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  const vault = await VaultService.get(context, { id: vaultId, centrifugeId });

  const { poolId, tokenId } = vault.read();
  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const pool = await PoolService.get(context, { id: poolId });
  if (!pool) throw new Error(`Pool with id ${poolId} not found`);
  const { currentEpochIndex } = pool.read();

  const it = await InvestorTransactionService.updateRedeemRequest(context, {
    poolId,
    tokenId,
    account: senderAddress.substring(0, 42),
    tokenAmount: assets,
    txHash: event.transaction.hash,
    epochIndex: currentEpochIndex,
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
  });
});

ponder.on("Vault:DepositClaimable", async ({ event, context }) => {
  logEvent(event, "Vault:DepositClaimable");
  const { controller: accountAddress, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`Vault id not found in event`);
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  const vault = await VaultService.get(context, { id: vaultId, centrifugeId });
  const { poolId, tokenId, kind } = vault.read();

  if (kind !== "Async") return;

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const it = await InvestorTransactionService.depositClaimable(context, {
    poolId,
    tokenId,
    account: accountAddress.substring(0, 42),
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice: getTokenPrice(shares, assets),
    txHash: event.transaction.hash,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  });
});

ponder.on("Vault:RedeemClaimable", async ({ event, context }) => {
  logEvent(event, "Vault:RedeemClaimable");
  const { controller: accountAddress, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`Vault id not found in event`);
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();
  const vault = await VaultService.get(context, { id: vaultId, centrifugeId });
  const { poolId, tokenId, kind } = vault.read();

  if (kind === "Sync") return;

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const it = await InvestorTransactionService.redeemClaimable(context, {
    poolId,
    tokenId,
    account: accountAddress.substring(0, 42),
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice: getTokenPrice(shares, assets),
    txHash: event.transaction.hash,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  });
});

ponder.on("Vault:Deposit", async ({ event, context }) => {
  logEvent(event, "Vault:Deposit");
  const { sender: senderAddress, owner, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`Vault id not found in event`);
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();
  const vault = await VaultService.get(context, { id: vaultId, centrifugeId });
  const { poolId, tokenId, kind } = vault.read();

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const itData = {
    poolId,
    tokenId,
    account: senderAddress.substring(0, 42),
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice: getTokenPrice(shares, assets),
    txHash: event.transaction.hash,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  };

  switch (kind) {
    case "Async":
      await InvestorTransactionService.claimDeposit(context, itData);
      break;
    default:
      await InvestorTransactionService.syncDeposit(context, itData);
      break;
  }
});

ponder.on("Vault:Withdraw", async ({ event, context }) => {
  logEvent(event, "Vault:Withdraw");
  const { sender: senderAddress, receiver: receiverAddress, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`Vault id not found in event`);
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();
  const vault = await VaultService.get(context, { id: vaultId, centrifugeId });
  const { poolId, tokenId, kind } = vault.read();

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const itData = {
    poolId,
    tokenId,
    account: receiverAddress.substring(0, 42),
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice: getTokenPrice(shares, assets),
    txHash: event.transaction.hash,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
  };

  switch (kind) {
    case "Sync":
      await InvestorTransactionService.syncRedeem(context, itData);
      break;
    default:
      await InvestorTransactionService.claimRedeem(context, itData);
      break;
  }
});

function getTokenPrice(tokenAmount: bigint, currencyAmount: bigint) {
  return (currencyAmount * 10n ** 18n) / tokenAmount;
}
