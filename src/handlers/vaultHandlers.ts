import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import {
  AccountService,
  AssetService,
  BlockchainService,
  EpochInvestOrderService,
  EpochRedeemOrderService,
  InvestOrderService,
  RedeemOrderService,
  TokenInstancePositionService,
  TokenService,
} from "../services";
import { InvestorTransactionService, VaultService } from "../services";
import { OutstandingInvestService } from "../services";
import { OutstandingRedeemService } from "../services";

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

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

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
      address: controller,
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

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = await VaultService.get(context, { id: vaultId, centrifugeId });
  if (!vault) throw new Error("Vault not found");
  const { poolId, tokenId, assetAddress } = vault.read();

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: controller,
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

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

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
      address: controller,
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

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

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
      address: controller,
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

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

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
  const { decimals, id: assetId } = asset.read();
  if (typeof decimals !== "number") throw new Error("Decimals is required");

  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: owner,
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
      const blockTimestamp = new Date(Number(event.block.timestamp) * 1000);
      const blockNumber = Number(event.block.number);
      const investOrderIndex =
        (await InvestOrderService.count(context, {
          poolId,
          tokenId,
          account: investorAddress,
          index_lte: 0,
        })) * -1;
      await InvestOrderService.insert(
        context,
        {
          poolId,
          tokenId,
          assetId,
          account: investorAddress,
          index: investOrderIndex,
          approvedAt: blockTimestamp,
          approvedAtBlock: blockNumber,
          approvedAssetsAmount: assets,
          issuedAt: blockTimestamp,
          issuedAtBlock: blockNumber,
          issuedSharesAmount: shares,
          issuedWithNavAssetPerShare: getSharePrice(shares, assets, decimals),
          claimedAt: blockTimestamp,
          claimedAtBlock: blockNumber,
        },
        event.block
      );

      const epochInvestIndex = (await EpochInvestOrderService.count(context, {
        poolId,
        tokenId,
        assetId,
        index_lte: 0,
      })) * -1;
      const _epochInvestOrder = (await EpochInvestOrderService.insert(
        context,
        {
          poolId,
          tokenId,
          assetId,
          index: epochInvestIndex,
          approvedAt: blockTimestamp,
          approvedAtBlock: blockNumber,
          approvedAssetsAmount: assets,
          approvedPoolAmount: assets,
          approvedPercentageOfTotalPending: 100n * 10n ** BigInt(decimals),
          issuedAt: blockTimestamp,
          issuedAtBlock: blockNumber,
          issuedSharesAmount: shares,
          issuedWithNavAssetPerShare: getSharePrice(shares, assets, decimals),
        },
        event.block
      )) as EpochInvestOrderService;
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

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = await VaultService.get(context, { id: vaultId, centrifugeId });
  if (!vault) throw new Error("Vault not found");
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  const assetQuery = (await AssetService.query(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService[];
  const asset = assetQuery.pop();
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { decimals, id: assetId } = asset.read();
  if (typeof decimals !== "number") throw new Error("Decimals is required");

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: owner,
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
      const blockTimestamp = new Date(Number(event.block.timestamp) * 1000);
      const blockNumber = Number(event.block.number);
      await InvestorTransactionService.syncRedeem(context, itData, event.block);
      const redeemOrderIndex =
        (await RedeemOrderService.count(context, {
          poolId,
          tokenId,
          account: investorAddress,
          index_lte: 0,
        })) * -1;
      await RedeemOrderService.insert(
        context,
        {
          poolId,
          tokenId,
          assetId,
          account: investorAddress,
          index: redeemOrderIndex,
          approvedAt: blockTimestamp,
          approvedAtBlock: blockNumber,
          approvedSharesAmount: shares,
          revokedAt: blockTimestamp,
          revokedAtBlock: blockNumber,
          revokedAssetsAmount: assets,
          revokedPoolAmount: assets,
          revokedWithNavAssetPerShare: getSharePrice(shares, assets, decimals),
          claimedAt: blockTimestamp,
          claimedAtBlock: blockNumber,
        },
        event.block
      );

      const epochRedeemIndex = (await EpochRedeemOrderService.count(context, {
        poolId,
        tokenId,
        assetId,
        index_lte: 0,
      })) * -1;
      (await EpochRedeemOrderService.insert(
        context,
        {
          poolId,
          tokenId,
          assetId,
          index: epochRedeemIndex,
          approvedAt: blockTimestamp,
          approvedAtBlock: blockNumber,
          approvedSharesAmount: shares,
          approvedPercentageOfTotalPending: 100n * 10n ** BigInt(decimals),
          revokedAt: blockTimestamp,
          revokedAtBlock: blockNumber,
          revokedAssetsAmount: assets,
          revokedWithNavAssetPerShare: getSharePrice(shares, assets, decimals),
        },
        event.block
      )) as EpochRedeemOrderService;

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
