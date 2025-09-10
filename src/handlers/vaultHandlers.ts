import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import {
  AccountService,
  AssetService,
  BlockchainService,
  TokenInstancePositionService,
  TokenService,
} from "../services";
import { InvestorTransactionService, VaultService } from "../services";
import { OutstandingInvestService } from "../services";
import { OutstandingRedeemService } from "../services";
import { getAddress } from "viem";

ponder.on("Vault:DepositRequest", async ({ event, context }) => {
  logEvent(event, context, "Vault:DepositRequest");
  const {
    controller,
    // owner,
    // requestId,
    //sender: senderAddress,
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

  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: getAddress(controller),
    },
    event.block
  )) as AccountService;
  const { address: investorAddress } = invstorAccount.read();

  const _tokenInstancePosition = (await TokenInstancePositionService.getOrInit(
    context,
    {
      tokenId,
      centrifugeId,
      accountAddress: investorAddress,
    },
    event.block
  )) as TokenInstancePositionService;

  const _it = await InvestorTransactionService.updateDepositRequest(
    context,
    {
      poolId,
      tokenId,
      account: investorAddress,
      currencyAmount: assets,
      txHash: event.transaction.hash,
      centrifugeId,
    },
    event.block
  );
  const assetQuery = (await AssetService.query(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService[];
  const asset = assetQuery.pop();
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { id: assetId } = asset.read();

  const OutstandingInvest = (await OutstandingInvestService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      account: investorAddress,
      assetId,
    },
    event.block
  )) as OutstandingInvestService;

  await OutstandingInvest.decorateOutstandingOrder(event)
    .updateDepositAmount(assets)
    .saveOrClear(event.block);
});

ponder.on("Vault:RedeemRequest", async ({ event, context }) => {
  logEvent(event, context, "Vault:RedeemRequest");
  const {
    controller,
    // owner,
    // requestId,
    // sender: senderAddress,
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
  const { poolId, tokenId, assetAddress } = vault.read();

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: getAddress(controller),
    },
    event.block
  )) as AccountService;
  const { address: investorAddress } = invstorAccount.read();

  const _it = await InvestorTransactionService.updateRedeemRequest(
    context,
    {
      poolId,
      tokenId,
      account: investorAddress.substring(0, 42) as `0x${string}`,
      tokenAmount: shares,
      txHash: event.transaction.hash,
      centrifugeId,
    },
    event.block
  );

  const assetQuery = (await AssetService.query(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService[];
  const asset = assetQuery.pop();
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { id: assetId } = asset.read();

  const OutstandingRedeem = (await OutstandingRedeemService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      account: investorAddress.substring(0, 42) as `0x${string}`,
      assetId,
    },
    event.block
  )) as OutstandingRedeemService;

  await OutstandingRedeem.decorateOutstandingOrder(event)
    .updateDepositAmount(shares)
    .saveOrClear(event.block);
});

ponder.on("Vault:DepositClaimable", async ({ event, context }) => {
  logEvent(event, context, "Vault:DepositClaimable");
  const { controller, assets, shares } = event.args;
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

  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: getAddress(controller),
    },
    event.block
  )) as AccountService;
  const { address: investorAddress } = invstorAccount.read();

  const _it = await InvestorTransactionService.depositClaimable(
    context,
    {
      poolId,
      tokenId,
      account: investorAddress,
      tokenAmount: shares,
      currencyAmount: assets,
      tokenPrice: getSharePrice(shares, assets, decimals),
      txHash: event.transaction.hash,
      centrifugeId,
    },
    event.block
  );
});

ponder.on("Vault:RedeemClaimable", async ({ event, context }) => {
  logEvent(event, context, "Vault:RedeemClaimable");
  const { controller, assets, shares } = event.args;
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

  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: getAddress(controller),
    },
    event.block
  )) as AccountService;
  const { address: investorAddress } = invstorAccount.read();

  const _it = await InvestorTransactionService.redeemClaimable(
    context,
    {
      poolId,
      tokenId,
      account: investorAddress,
      tokenAmount: shares,
      currencyAmount: assets,
      tokenPrice: getSharePrice(shares, assets, decimals),
      txHash: event.transaction.hash,
      centrifugeId,
    },
    event.block
  );
});

ponder.on("Vault:Deposit", async ({ event, context }) => {
  logEvent(event, context, "Vault:Deposit");
  const {
    //controller: investorAddress,
    //sender: investorAddress,
    owner,
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

  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: getAddress(owner),
    },
    event.block
  )) as AccountService;

  const { address: investorAddress } = invstorAccount.read();

  const itData = {
    poolId,
    tokenId,
    account: investorAddress,
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice: getSharePrice(shares, assets, decimals),
    txHash: event.transaction.hash,
    centrifugeId,
  };

  switch (kind) {
    case "Async":
      await InvestorTransactionService.claimDeposit(
        context,
        itData,
        event.block
      );
      break;
    default:
      await InvestorTransactionService.syncDeposit(
        context,
        itData,
        event.block
      );
      break;
  }
});

ponder.on("Vault:Withdraw", async ({ event, context }) => {
  logEvent(event, context, "Vault:Withdraw");
  const {
    //controller: investorAddress,
    owner,
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

  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: getAddress(owner),
    },
    event.block
  )) as AccountService;
  const { address: investorAddress } = invstorAccount.read();

  const itData = {
    poolId,
    tokenId,
    account: investorAddress,
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice: getSharePrice(shares, assets, decimals),
    txHash: event.transaction.hash,
    centrifugeId,
  };

  switch (kind) {
    case "Sync":
      await InvestorTransactionService.syncRedeem(context, itData, event.block);
      break;
    default:
      await InvestorTransactionService.claimRedeem(
        context,
        itData,
        event.block
      );
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
function getSharePrice(
  sharesAmount: bigint,
  assetsAmount: bigint,
  assetDecimals: number
) {
  if (assetsAmount === 0n) return null;
  return (sharesAmount * 10n ** BigInt(assetDecimals)) / assetsAmount;
}
