import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import {
  AssetService,
  BlockchainService,
  TokenService,
} from "../services";
import { InvestorTransactionService, VaultService } from "../services";
import { OutstandingInvestService } from "../services";
import { OutstandingRedeemService } from "../services";

ponder.on("Vault:DepositRequest", async ({ event, context }) => {
  console.log("OODEBUG-");
  logEvent(event, context, "Vault:DepositRequest");
  const {
    // controller,
    // owner,
    // requestId,
    sender: senderAddress,
    assets,
  } = event.args;

  const vaultId = event.log.address;
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) throw new Error("Vault not found");

  const { poolId, tokenId, assetAddress } = vault.read();
  const token = await TokenService.get(context, {
    poolId: poolId,
    id: tokenId,
  });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const _it = await InvestorTransactionService.updateDepositRequest(context, {
    poolId,
    tokenId,
    account: senderAddress.substring(0, 42) as `0x${string}`,
    currencyAmount: assets,
    txHash: event.transaction.hash,
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
    centrifugeId,
  });
  const assetQuery = (await AssetService.query(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService[];
  const asset = assetQuery.pop();
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { id: assetId } = asset.read();

  const OutstandingInvest = (await OutstandingInvestService.getOrInit(context, {
    poolId,
    tokenId,
    account: senderAddress.substring(0, 42) as `0x${string}`,
    assetId,
  })) as OutstandingInvestService;

  await OutstandingInvest.decorateOutstandingOrder(event)
    .updatePendingAmount(assets)
    .computeTotalOutstandingAmount()
    .save();
  console.log("-OODEBUG");
});

ponder.on("Vault:RedeemRequest", async ({ event, context }) => {
  console.log("OODEBUG-");
  logEvent(event, context, "Vault:RedeemRequest");
  const {
    // controller,
    // owner,
    // requestId,
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
  if (!vault) throw new Error("Vault not found");
  const { poolId, tokenId, assetAddress } = vault.read();

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const _it = await InvestorTransactionService.updateRedeemRequest(context, {
    poolId,
    tokenId,
    account: senderAddress.substring(0, 42) as `0x${string}`,
    tokenAmount: assets,
    txHash: event.transaction.hash,
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
    centrifugeId,
  });

  const assetQuery = (await AssetService.query(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService[];
  const asset = assetQuery.pop();
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { id: assetId } = asset.read();

  const OutstandingRedeem = (await OutstandingRedeemService.getOrInit(context, {
    poolId,
    tokenId,
    account: senderAddress.substring(0, 42) as `0x${string}`,
    assetId,
  })) as OutstandingRedeemService;

  await OutstandingRedeem.decorateOutstandingOrder(event)
    .updatePendingAmount(assets)
    .computeTotalOutstandingAmount()
    .save();
  console.log("-OODEBUG");
});

ponder.on("Vault:DepositClaimable", async ({ event, context }) => {
  logEvent(event, context, "Vault:DepositClaimable");
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
  if (!vault) throw new Error("Vault not found");
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  if (kind !== "Async") return;

  const assetQuery = (await AssetService.query(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService[];
  const asset = assetQuery.pop();
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { decimals } = asset.read();
  if (typeof decimals !== "number") throw new Error("Decimals is required");

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const _it = await InvestorTransactionService.depositClaimable(context, {
    poolId,
    tokenId,
    account: accountAddress.substring(0, 42) as `0x${string}`,
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice: getSharePrice(shares, assets, decimals),
    txHash: event.transaction.hash,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    centrifugeId,
  });
});

ponder.on("Vault:RedeemClaimable", async ({ event, context }) => {
  logEvent(event, context, "Vault:RedeemClaimable");
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
  if (!vault) throw new Error("Vault not found");
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  if (kind === "Sync") return;

  const assetQuery = (await AssetService.query(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService[];
  const asset = assetQuery.pop();
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { decimals } = asset.read();
  if (typeof decimals !== "number") throw new Error("Decimals is required");

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const _it = await InvestorTransactionService.redeemClaimable(context, {
    poolId,
    tokenId,
    account: accountAddress.substring(0, 42) as `0x${string}`,
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice: getSharePrice(shares, assets, decimals),
    txHash: event.transaction.hash,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    centrifugeId,
  });
});

ponder.on("Vault:Deposit", async ({ event, context }) => {
  logEvent(event, context, "Vault:Deposit");
  const {
    sender: senderAddress,
    //owner,
    assets,
    shares,
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
  if (!vault) throw new Error("Vault not found");
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const assetQuery = (await AssetService.query(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService[];
  const asset = assetQuery.pop();
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { decimals } = asset.read();
  if (typeof decimals !== "number") throw new Error("Decimals is required");

  const itData = {
    poolId,
    tokenId,
    account: senderAddress.substring(0, 42) as `0x${string}`,
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice: getSharePrice(shares, assets, decimals),
    txHash: event.transaction.hash,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    centrifugeId,
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
  logEvent(event, context, "Vault:Withdraw");
  const {
    //sender: senderAddress,
    receiver: receiverAddress,
    assets,
    shares,
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
  if (!vault) throw new Error("Vault not found");
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  const assetQuery = (await AssetService.query(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService[];
  const asset = assetQuery.pop();
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { decimals } = asset.read();
  if (typeof decimals !== "number") throw new Error("Decimals is required");

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const itData = {
    poolId,
    tokenId,
    account: receiverAddress.substring(0, 42) as `0x${string}`,
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice: getSharePrice(shares, assets, decimals),
    txHash: event.transaction.hash,
    createdAtBlock: Number(event.block.number),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    centrifugeId,
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

/**
 * Calculates the price of a token in terms of currency.
 * 
 * @param tokenAmount - The amount of tokens
 * @param currencyAmount - The amount of currency
 * @returns The price of the token in terms of currency
 */
function getSharePrice(sharesAmount: bigint, assetsAmount: bigint, assetDecimals: number) {
  return (sharesAmount * 10n ** BigInt(assetDecimals)) / assetsAmount;
}
