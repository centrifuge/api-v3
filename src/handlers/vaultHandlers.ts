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
  TokenInstanceService,
  TokenService,
} from "../services";
import { InvestorTransactionService, VaultService } from "../services";
import { OutstandingInvestService } from "../services";
import { OutstandingRedeemService } from "../services";
import { initialisePosition } from "../services/TokenInstancePositionService";

ponder.on("VaultV3:DepositRequest", async ({ event, context }) => {
  logEvent(event, context, "VaultV3:DepositRequest");
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

  const { poolId, tokenId, assetAddress} = vault.read();

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

  const tokenInstance = (await TokenInstanceService.get(context, {
    tokenId,
    centrifugeId,
  })) as TokenInstanceService;
  if (!tokenInstance) throw new Error(`TokenInstance not found for vault ${vaultId}`);
  const { address: tokenAddress } = tokenInstance.read();

  const _tokenInstancePosition = (await TokenInstancePositionService.getOrInit(
    context,
    {
      tokenId,
      centrifugeId,
      accountAddress: investorAddress,
    },
    event.block,
    async (tokenInstancePosition) => await initialisePosition(context, tokenAddress, tokenInstancePosition)
  )) as TokenInstancePositionService;

  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { id: assetId } = asset.read();

  const _it = await InvestorTransactionService.updateDepositRequest(
    context,
    {
      poolId,
      tokenId,
      account: investorAddress,
      currencyAmount: assets,
      txHash: event.transaction.hash,
      centrifugeId,
      currencyAssetId: assetId,
    },
    event.block
  );

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

ponder.on("VaultV3:RedeemRequest", async ({ event, context }) => {
  logEvent(event, context, "VaultV3:RedeemRequest");
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

  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { id: assetId } = asset.read();

  const _it = await InvestorTransactionService.updateRedeemRequest(
    context,
    {
      poolId,
      tokenId,
      account: investorAddress.substring(0, 42) as `0x${string}`,
      tokenAmount: shares,
      txHash: event.transaction.hash,
      centrifugeId,
      currencyAssetId: assetId,
    },
    event.block
  );

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

ponder.on("VaultV3:DepositClaimable", async ({ event, context }) => {
  logEvent(event, context, "VaultV3:DepositClaimable");
  const { controller, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`Vault id not found in event`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = await VaultService.get(context, { id: vaultId, centrifugeId });
  if (!vault) throw new Error("Vault not found");
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  if (kind !== "Async") return;

  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { decimals: assetDecimals, id: assetId } = asset.read();
  if (typeof assetDecimals !== "number") throw new Error("Asset decimals is required");

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);
  const { decimals: shareDecimals } = token.read();
  if (typeof shareDecimals !== "number") throw new Error("Share decimals is required");

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
      tokenPrice: getSharePrice(assets, shares, assetDecimals, shareDecimals),
      txHash: event.transaction.hash,
      centrifugeId,
      currencyAssetId: assetId,
    },
    event.block
  );
});

ponder.on("VaultV3:RedeemClaimable", async ({ event, context }) => {
  logEvent(event, context, "VaultV3:RedeemClaimable");
  const { controller, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`Vault id not found in event`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = await VaultService.get(context, { id: vaultId, centrifugeId });
  if (!vault) throw new Error("Vault not found");
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  if (kind === "Sync") return;

  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { decimals: assetDecimals, id: assetId } = asset.read();
  if (typeof assetDecimals !== "number") throw new Error("Asset decimals is required");

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);
  const { decimals: shareDecimals } = token.read();
  if (typeof shareDecimals !== "number") throw new Error("Share decimals is required");

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
      tokenPrice: getSharePrice(assets, shares, assetDecimals, shareDecimals),
      txHash: event.transaction.hash,
      centrifugeId,
      currencyAssetId: assetId,
    },
    event.block
  );
});

ponder.on('VaultV3:Deposit', async ({ event, context }) => {
  logEvent(event, context, "VaultV3:Deposit");
  const { owner, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`Vault id not found in event`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = await VaultService.get(context, { id: vaultId, centrifugeId });
  if (!vault) throw new Error("Vault not found");
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);
  const { decimals: shareDecimals } = token.read();
  if (typeof shareDecimals !== "number") throw new Error("Share decimals is required");
  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { decimals: assetDecimals, id: assetId } = asset.read();
  if (typeof assetDecimals !== "number") throw new Error("Asset decimals is required");

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
    tokenPrice: getSharePrice(assets, shares, assetDecimals, shareDecimals),
    txHash: event.transaction.hash,
    centrifugeId,
    currencyAssetId: assetId,
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
          issuedWithNavAssetPerShare: getSharePrice(assets, shares, assetDecimals, shareDecimals),
          claimedAt: blockTimestamp,
          claimedAtBlock: blockNumber,
        },
        event.block
      );

      const epochInvestIndex =
        (await EpochInvestOrderService.count(context, {
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
          approvedPercentageOfTotalPending: 100n * 10n ** BigInt(assetDecimals),
          issuedAt: blockTimestamp,
          issuedAtBlock: blockNumber,
          issuedSharesAmount: shares,
          issuedWithNavAssetPerShare: getSharePrice(assets, shares, assetDecimals, shareDecimals),
        },
        event.block
      )) as EpochInvestOrderService;
      break;
  }
});

ponder.on("VaultV3:Withdraw", async ({ event, context }) => {
  logEvent(event, context, "VaultV3:Withdraw");
  const { owner, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`Vault id not found in event`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = await VaultService.get(context, { id: vaultId, centrifugeId });
  if (!vault) throw new Error("Vault not found");
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { decimals: assetDecimals, id: assetId } = asset.read();
  if (typeof assetDecimals !== "number") throw new Error("Asset decimals is required");

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);
  const { decimals: shareDecimals } = token.read();
  if (typeof shareDecimals !== "number") throw new Error("Share decimals is required");
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
    tokenPrice: getSharePrice(assets, shares, assetDecimals, shareDecimals),
    txHash: event.transaction.hash,
    centrifugeId,
    currencyAssetId: assetId,
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
          revokedWithNavAssetPerShare: getSharePrice(assets, shares, assetDecimals, shareDecimals),
          claimedAt: blockTimestamp,
          claimedAtBlock: blockNumber,
        },
        event.block
      );

      const epochRedeemIndex =
        (await EpochRedeemOrderService.count(context, {
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
          approvedPercentageOfTotalPending: 100n * 10n ** BigInt(shareDecimals),
          revokedAt: blockTimestamp,
          revokedAtBlock: blockNumber,
          revokedAssetsAmount: assets,
          revokedWithNavAssetPerShare: getSharePrice(assets, shares, assetDecimals, shareDecimals),
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
  assetsAmount: bigint,
  sharesAmount: bigint,
  assetDecimals: number,
  shareDecimals: number
) {
  if (sharesAmount === 0n) return null;
  return (
    (assetsAmount * 10n ** BigInt(18 - assetDecimals + shareDecimals)) /
    sharesAmount
  );
}
