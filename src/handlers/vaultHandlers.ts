import { multiMapper } from "../helpers/multiMapper";
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
import { timestamper } from "../helpers/timestamper";

multiMapper("vault:DepositRequest", async ({ event, context }) => {
  logEvent(event, context, "vault:DepositRequest");
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
  if (!vault) throw new Error("vault not found");

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
    event
  )) as AccountService;
  const { address: investorAddress } = invstorAccount.read();

  const tokenInstance = (await TokenInstanceService.get(context, {
    tokenId,
    centrifugeId,
  })) as TokenInstanceService;
  if (!tokenInstance)
    throw new Error(`TokenInstance not found for vault ${vaultId}`);
  const { address: tokenAddress } = tokenInstance.read();

  const _tokenInstancePosition = (await TokenInstancePositionService.getOrInit(
    context,
    {
      tokenId,
      centrifugeId,
      accountAddress: investorAddress,
    },
    event,
    async (tokenInstancePosition) =>
      await initialisePosition(context, tokenAddress, tokenInstancePosition)
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
      txHash: event.transaction.hash,
      poolId,
      tokenId,
      account: investorAddress,
      currencyAmount: assets,
      centrifugeId,
      currencyAssetId: assetId,
    },
    event
  );

  const outstandingInvest = (await OutstandingInvestService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      account: investorAddress,
      assetId,
    },
    event
  )) as OutstandingInvestService;
  await outstandingInvest.updateDepositAmount(assets).saveOrClear(event);
});

multiMapper("vault:RedeemRequest", async ({ event, context }) => {
  logEvent(event, context, "vault:RedeemRequest");
  const {
    controller,
    // owner,
    // requestId,
    // sender: senderAddress,
    shares,
  } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`vault id not found in event`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) throw new Error("vault not found");
  const { poolId, tokenId, assetAddress } = vault.read();

  const token = (await TokenService.get(context, {
    poolId,
    id: tokenId,
  })) as TokenService;
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);

  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: controller,
    },
    event
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
      txHash: event.transaction.hash,
      poolId,
      tokenId,
      account: investorAddress.substring(0, 42) as `0x${string}`,
      tokenAmount: shares,
      centrifugeId,
      currencyAssetId: assetId,
    },
    event
  );

  const OutstandingRedeem = (await OutstandingRedeemService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      account: investorAddress.substring(0, 42) as `0x${string}`,
      assetId,
    },
    event
  )) as OutstandingRedeemService;

  await OutstandingRedeem.updateDepositAmount(shares).saveOrClear(event);
});

multiMapper("vault:DepositClaimable", async ({ event, context }) => {
  logEvent(event, context, "vault:DepositClaimable");
  const { controller, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`vault id not found in event`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) throw new Error("vault not found");
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  if (kind !== "Async") return;

  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { decimals: assetDecimals, id: assetId } = asset.read();
  if (typeof assetDecimals !== "number")
    throw new Error("Asset decimals is required");

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);
  const { decimals: shareDecimals } = token.read();
  if (typeof shareDecimals !== "number")
    throw new Error("Share decimals is required");

  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: controller,
    },
    event
  )) as AccountService;
  const { address: investorAddress } = invstorAccount.read();

  const _it = await InvestorTransactionService.depositClaimable(
    context,
    {
      txHash: event.transaction.hash,
      poolId,
      tokenId,
      account: investorAddress,
      tokenAmount: shares,
      currencyAmount: assets,
      tokenPrice: getSharePrice(assets, shares, assetDecimals, shareDecimals),
      centrifugeId,
      currencyAssetId: assetId,
    },
    event
  );
});

multiMapper("vault:RedeemClaimable", async ({ event, context }) => {
  logEvent(event, context, "vault:RedeemClaimable");
  const { controller, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`vault id not found in event`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) throw new Error("vault not found");
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  if (kind === "Sync") return;

  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { decimals: assetDecimals, id: assetId } = asset.read();
  if (typeof assetDecimals !== "number")
    throw new Error("Asset decimals is required");

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);
  const { decimals: shareDecimals } = token.read();
  if (typeof shareDecimals !== "number")
    throw new Error("Share decimals is required");

  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: controller,
    },
    event
  )) as AccountService;
  const { address: investorAddress } = invstorAccount.read();

  const _it = await InvestorTransactionService.redeemClaimable(
    context,
    {
      txHash: event.transaction.hash,
      poolId,
      tokenId,
      account: investorAddress,
      tokenAmount: shares,
      currencyAmount: assets,
      tokenPrice: getSharePrice(assets, shares, assetDecimals, shareDecimals),
      centrifugeId,
      currencyAssetId: assetId,
    },
    event
  );
});

multiMapper("vault:Deposit", async ({ event, context }) => {
  logEvent(event, context, "vault:Deposit");
  const { owner, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`vault id not found in event`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) throw new Error("vault not found");
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);
  const { decimals: shareDecimals } = token.read();
  if (typeof shareDecimals !== "number")
    throw new Error("Share decimals is required");
  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { decimals: assetDecimals, id: assetId } = asset.read();
  if (typeof assetDecimals !== "number")
    throw new Error("Asset decimals is required");

  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: owner,
    },
    event
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
      await InvestorTransactionService.claimDeposit(context, itData, event);
      break;
    default:
      await InvestorTransactionService.syncDeposit(context, itData, event);
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
          ...timestamper("approved", event),
          approvedAssetsAmount: assets,
          ...timestamper("issued", event),
          issuedSharesAmount: shares,
          issuedWithNavAssetPerShare: getSharePrice(
            assets,
            shares,
            assetDecimals,
            shareDecimals
          ),
          ...timestamper("claimed", event),
        },
        event
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
          ...timestamper("approved", event),
          approvedAssetsAmount: assets,
          approvedPoolAmount: assets,
          approvedPercentageOfTotalPending: 100n * 10n ** BigInt(assetDecimals),
          ...timestamper("issued", event),
          issuedSharesAmount: shares,
          issuedWithNavAssetPerShare: getSharePrice(
            assets,
            shares,
            assetDecimals,
            shareDecimals
          ),
        },
        event
      )) as EpochInvestOrderService;
      break;
  }
});

multiMapper("vault:Withdraw", async ({ event, context }) => {
  logEvent(event, context, "vault:Withdraw");
  const { owner, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) throw new Error(`vault id not found in event`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) throw new Error("vault not found");
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) throw new Error(`Asset not found for address ${assetAddress}`);
  const { decimals: assetDecimals, id: assetId } = asset.read();
  if (typeof assetDecimals !== "number")
    throw new Error("Asset decimals is required");

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) throw new Error(`Token not found for vault ${vaultId}`);
  const { decimals: shareDecimals } = token.read();
  if (typeof shareDecimals !== "number")
    throw new Error("Share decimals is required");
  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: owner,
    },
    event
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
      await InvestorTransactionService.syncRedeem(context, itData, event);
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
          ...timestamper("approved", event),
          approvedSharesAmount: shares,
          ...timestamper("revoked", event),
          revokedAssetsAmount: assets,
          revokedPoolAmount: assets,
          revokedWithNavAssetPerShare: getSharePrice(
            assets,
            shares,
            assetDecimals,
            shareDecimals
          ),
          ...timestamper("claimed", event),
        },
        event
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
          ...timestamper("approved", event),
          approvedSharesAmount: shares,
          approvedPercentageOfTotalPending: 100n * 10n ** BigInt(shareDecimals),
          ...timestamper("revoked", event),
          revokedAssetsAmount: assets,
          revokedWithNavAssetPerShare: getSharePrice(
            assets,
            shares,
            assetDecimals,
            shareDecimals
          ),
        },
        event
      )) as EpochRedeemOrderService;

      break;
    default:
      await InvestorTransactionService.claimRedeem(context, itData, event);
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
