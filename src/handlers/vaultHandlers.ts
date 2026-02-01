import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError } from "../helpers/logger";
import {
  AccountService,
  AssetService,
  BlockchainService,
  EpochInvestOrderService,
  InvestOrderService,
  TokenInstancePositionService,
  TokenInstanceService,
  TokenService,
  VaultInvestOrderService,
  VaultRedeemOrderService,
} from "../services";
import { InvestorTransactionService, VaultService } from "../services";
import { OutstandingInvestService } from "../services"; // TODO: DEPRECATED to be deleted in future releases
import { OutstandingRedeemService } from "../services"; // TODO: DEPRECATED to be deleted in future releases
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

  const investor = controller.substring(0, 42) as `0x${string}`;
  const vaultId = event.log.address;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) return serviceError(`Vault not found. Cannot retrieve vault configuration`);

  const { poolId, tokenId, assetAddress } = vault.read();

  const token = await TokenService.get(context, {
    poolId: poolId,
    id: tokenId,
  });
  if (!token) return serviceError(`Token not found. Cannot retrieve token configuration`);

  const _investorAccount = (await AccountService.getOrInit(
    context,
    {
      address: investor,
    },
    event
  )) as AccountService;

  const tokenInstance = (await TokenInstanceService.get(context, {
    tokenId,
    centrifugeId,
  })) as TokenInstanceService;
  if (!tokenInstance) return serviceError(`TokenInstance not found. Cannot initialize position`);
  const { address: tokenAddress } = tokenInstance.read();

  const _tokenInstancePosition = (await TokenInstancePositionService.getOrInit(
    context,
    {
      tokenId,
      centrifugeId,
      accountAddress: investor,
    },
    event,
    async (tokenInstancePosition) =>
      await initialisePosition(context, tokenAddress, tokenInstancePosition)
  )) as TokenInstancePositionService;

  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) return serviceError(`Asset not found. Cannot retrieve assetId`);
  const { id: assetId } = asset.read();

  const _it = await InvestorTransactionService.updateDepositRequest(
    context,
    {
      txHash: event.transaction.hash,
      poolId,
      tokenId,
      account: investor,
      currencyAmount: assets,
      centrifugeId,
      currencyAssetId: assetId,
    },
    event
  );

  // TODO: DEPRECATED to be removed in future releases
  const outstandingInvest = (await OutstandingInvestService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      account: investor,
      assetId,
    },
    event
  )) as OutstandingInvestService;
  await outstandingInvest.updateDepositAmount(assets).saveOrClear(event);

  const vaultInvestOrder = (await VaultInvestOrderService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      centrifugeId,
      assetId,
      accountAddress: investor,
    },
    event,
    undefined,
    true
  )) as VaultInvestOrderService;

  await vaultInvestOrder.depositRequest(assets).save(event);
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
  const investor = controller.substring(0, 42) as `0x${string}`;
  const vaultId = event.log.address;
  if (!vaultId)
    return serviceError(`Vault id not found in event log address, cannot process redeem request`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) return serviceError(`Vault not found. Cannot retrieve vault configuration`);
  const { poolId, tokenId, assetAddress } = vault.read();

  const token = (await TokenService.get(context, {
    poolId,
    id: tokenId,
  })) as TokenService;
  if (!token) return serviceError(`Token not found. Cannot retrieve token configuration`);

  const _investorAccount = (await AccountService.getOrInit(
    context,
    {
      address: investor,
    },
    event
  )) as AccountService;

  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) return serviceError(`Asset not found. Cannot retrieve assetId`);
  const { id: assetId } = asset.read();

  const _it = await InvestorTransactionService.updateRedeemRequest(
    context,
    {
      txHash: event.transaction.hash,
      poolId,
      tokenId,
      account: investor,
      tokenAmount: shares,
      centrifugeId,
      currencyAssetId: assetId,
    },
    event
  );

  // TODO: DEPRECATED to be deleted in future releases
  const outstandingRedeem = (await OutstandingRedeemService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      account: investor,
      assetId,
    },
    event
  )) as OutstandingRedeemService;

  await outstandingRedeem.updateDepositAmount(shares).saveOrClear(event);

  const vaultRedeemOrder = (await VaultRedeemOrderService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      centrifugeId,
      assetId,
      accountAddress: investor,
    },
    event,
    undefined,
    true
  )) as VaultRedeemOrderService;

  await vaultRedeemOrder.redeemRequest(shares).save(event);
});

multiMapper("vault:DepositClaimable", async ({ event, context }) => {
  logEvent(event, context, "vault:DepositClaimable");
  const { controller, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) return serviceError(`vault id not found in event`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) return serviceError(`Vault not found. Cannot retrieve vault configuration`);
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  if (kind !== "Async") return;

  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) return serviceError(`Asset not found. Cannot compute share price`);
  const { decimals: assetDecimals, id: assetId } = asset.read();
  if (typeof assetDecimals !== "number") return serviceError("Asset decimals is required");

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) return serviceError(`Token not found. Cannot compute share price`);
  const { decimals: shareDecimals } = token.read();
  if (typeof shareDecimals !== "number") return serviceError("Share decimals is required");

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

  const vaultInvestOrder = (await VaultInvestOrderService.getOrInit(
    context,
    {
      centrifugeId,
      poolId,
      tokenId,
      assetId,
      accountAddress: investorAddress,
    },
    event,
    undefined,
    true
  )) as VaultInvestOrderService;
  await vaultInvestOrder.claimableDeposit(assets).save(event);
});

multiMapper("vault:RedeemClaimable", async ({ event, context }) => {
  logEvent(event, context, "vault:RedeemClaimable");
  const { controller, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) return serviceError(`Vault id not found in event. Cannot identify vault`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) return serviceError(`Vault not found. Cannot retrieve vault configuration`);
  const { poolId, tokenId, assetAddress } = vault.read();


  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) return serviceError(`Asset not found. Cannot compute share price`);
  const { decimals: assetDecimals, id: assetId } = asset.read();
  if (typeof assetDecimals !== "number") return serviceError("Asset decimals is required");

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) return serviceError(`Token not found. Cannot compute share price`);
  const { decimals: shareDecimals } = token.read();
  if (typeof shareDecimals !== "number") return serviceError("Share decimals is required");

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

  const vaultRedeemOrder = (await VaultRedeemOrderService.getOrInit(
    context,
    {
      centrifugeId,
      poolId,
      tokenId,
      assetId,
      accountAddress: investorAddress,
    },
    event,
    undefined,
    true
  )) as VaultRedeemOrderService;
  await vaultRedeemOrder.claimableRedeem(shares).save(event);
});

multiMapper("vault:Deposit", async ({ event, context }) => {
  logEvent(event, context, "vault:Deposit");
  const { sender, owner, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) return serviceError(`Vault id not found in event. Cannot identify vault`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) return serviceError(`Vault not found. Cannot retrieve vault configuration`);
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) return serviceError(`Token not found. Cannot retrieve token configuration`);
  const { decimals: shareDecimals } = token.read();
  if (typeof shareDecimals !== "number")
    return serviceError("Share decimals is required to compute share price");
  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) return serviceError(`Asset not found. Cannot retrieve assetId`);
  const { decimals: assetDecimals, id: assetId } = asset.read();
  if (typeof assetDecimals !== "number")
    return serviceError("Asset decimals is required to compute share price");

  // NOTE: In our current implementation v3.1 there is a bug in the SyncDepositVault where `sender` and `receiver` are swapped 
  //       in the event data. 
  //       -> Use sender as our investor in this case.
  let investor: `0x${string}`;
  switch (kind) {
    case "Async":
      investor = owner;
      break;
    case "SyncDepositAsyncRedeem":
    case "Sync":
      investor = sender;
      break;
    default:
      return serviceError("Unknown vault kind");
  }

  const investorAccount = (await AccountService.getOrInit(
    context,
    {
      address: investor,
    },
    event
  )) as AccountService;

  const { address: investorAddress } = investorAccount.read();

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
      const vaultInvestOrder = (await VaultInvestOrderService.getOrInit(
        context,
        {
          centrifugeId,
          poolId,
          tokenId,
          assetId,
          accountAddress: investorAddress,
        },
        event,
        undefined,
        true
      )) as VaultInvestOrderService;
      await vaultInvestOrder.deposit(assets).saveOrClear(event);
      break;
    case "SyncDepositAsyncRedeem":
    case "Sync":
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
          issuedWithNavAssetPerShare: getSharePrice(assets, shares, assetDecimals, shareDecimals),
          ...timestamper("claimed", event),
          claimedSharesAmount: shares,
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
          issuedWithNavAssetPerShare: getSharePrice(assets, shares, assetDecimals, shareDecimals),
        },
        event
      )) as EpochInvestOrderService;
      break;
    default:
      return serviceError("Unknown vault kind");
  }
});

multiMapper("vault:Withdraw", async ({ event, context }) => {
  logEvent(event, context, "vault:Withdraw");
  const { receiver, assets, shares } = event.args;
  const vaultId = event.log.address;
  if (!vaultId) return serviceError(`Vault id not found in event. Cannot identify vault`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) return serviceError(`Vault not found. Cannot retrieve vault configuration`);
  const { poolId, tokenId, kind, assetAddress } = vault.read();

  const asset = (await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  })) as AssetService;
  if (!asset) return serviceError(`Asset not found. Cannot retrieve assetId`);
  const { decimals: assetDecimals, id: assetId } = asset.read();
  if (typeof assetDecimals !== "number") return serviceError("Asset decimals is required");

  const token = await TokenService.get(context, { poolId, id: tokenId });
  if (!token) return serviceError(`Token not found. Cannot retrieve token configuration`);
  const { decimals: shareDecimals } = token.read();
  if (typeof shareDecimals !== "number") return serviceError("Share decimals is required");
  const invstorAccount = (await AccountService.getOrInit(
    context,
    {
      address: receiver,
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
      return serviceError("Sync vaults are not supported yet");
    case "SyncDepositAsyncRedeem":
    case "Async":
      const vaultRedeemOrder = (await VaultRedeemOrderService.getOrInit(
        context,
        {
          centrifugeId,
          poolId,
          tokenId,
          assetId,
          accountAddress: investorAddress,
        },
        event,
        undefined,
        true
      )) as VaultRedeemOrderService;
      await vaultRedeemOrder.redeem(shares).saveOrClear(event);

      await InvestorTransactionService.claimRedeem(context, itData, event);
      break;
    default:
      return serviceError("Unknown vault kind");
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
  return (assetsAmount * 10n ** BigInt(18 - assetDecimals + shareDecimals)) / sharesAmount;
}
