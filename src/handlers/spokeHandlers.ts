import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError } from "../helpers/logger";
import {
  BlockchainService,
  AssetService,
  TokenInstanceService,
  HoldingEscrowService,
  TokenService,
  InvestorTransactionService,
  AccountService,
  TokenInstancePositionService,
} from "../services";
import { ERC20Abi } from "../../abis/ERC20";
import { Abis } from "../contracts";
import { RegistryChains } from "../chains";
import { snapshotter } from "../helpers/snapshotter";
import { HoldingEscrowSnapshot } from "ponder:schema";
import { deployVault, linkVault, unlinkVault } from "./vaultRegistryHandlers";
import { getInitialHolders } from "../config";
import { initialisePosition } from "../services/TokenInstancePositionService";

multiMapper("spoke:DeployVault", deployVault);

multiMapper("spoke:RegisterAsset", async ({ event, context }) => {
  //Fires first to request registration to HUB
  logEvent(event, context, "spoke:RegisterAsset");
  const {
    assetId,
    asset: assetAddress,
    tokenId: assetTokenId,
    name,
    symbol,
    decimals,
  } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const _asset = (await AssetService.upsert(
    context,
    {
      id: assetId,
      centrifugeId,
      address: assetAddress,
      decimals: decimals,
      name: name,
      symbol: symbol,
      assetTokenId,
    },
    event
  )) as AssetService | null;
});

multiMapper("spoke:AddShareClass", async ({ event, context }) => {
  logEvent(event, context, "spoke:AddShareClass");
  const { poolId, scId: tokenId, token: tokenAddress } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const totalSupply = await context.client.readContract({
    abi: ERC20Abi,
    address: tokenAddress,
    functionName: "totalSupply",
    args: [],
  });

  // Get the existing token instance
  const tokenInstance = (await TokenInstanceService.getOrInit(
    context,
    {
      address: tokenAddress,
      tokenId,
      centrifugeId,
    },
    event
  )) as TokenInstanceService;

  // Store previous issuance
  const prevInstanceIssuance = tokenInstance.read().totalIssuance ?? 0n;

  // Set token instance properties
  tokenInstance.setTotalIssuance(totalSupply);
  tokenInstance.activate();
  await tokenInstance.save(event);

  // Get or create token
  const token = (await TokenService.getOrInit(
    context,
    {
      id: tokenId,
      poolId,
    },
    event
  )) as TokenService;

  // Only increase token total issuance if this is a new token instance
  if (prevInstanceIssuance === 0n) {
    token.increaseTotalIssuance(totalSupply);

    // Fetch initial holders from hardcoded list
    const initialHolders: string[] = getInitialHolders(poolId, tokenId, centrifugeId);
    if (initialHolders.length > 0) {
      await Promise.all(
        initialHolders.map(async (holder: string) => {
          (await TokenInstancePositionService.getOrInit(
            context,
            {
              tokenId,
              centrifugeId,
              accountAddress: holder.toLowerCase() as `0x${string}`,
            },
            event,
            async (tokenInstancePosition) =>
              await initialisePosition(context, tokenAddress, tokenInstancePosition)
          )) as TokenInstancePositionService;
        })
      );
    }
  }

  await token.save(event);
});

multiMapper("spoke:UpdateSharePrice", async ({ event, context }) => {
  logEvent(event, context, "spoke:PriceUpdate");
  const {
    //poolId,
    scId: tokenId,
    // tokenId: _tokenId,
    price: tokenPrice,
    computedAt: _computedAt,
  } = event.args;
  const computedAt = new Date(Number(_computedAt.toString()) * 1000);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const tokenInstance = (await TokenInstanceService.get(context, {
    tokenId,
    centrifugeId,
  })) as TokenInstanceService;
  if (!tokenInstance) return serviceError(`TokenInstance not found. Cannot update token price`);

  await tokenInstance.setTokenPrice(tokenPrice);
  await tokenInstance.setComputedAt(computedAt);
  await tokenInstance.save(event);
});

multiMapper("spoke:UpdateAssetPrice", async ({ event, context }) => {
  logEvent(event, context, "spoke:UpdateAssetPrice");

  const {
    poolId: poolId,
    scId: tokenId,
    asset: assetAddress,
    price: assetPrice,
    //computedAt,
  } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const chainId = context.chain.id;
  const poolEscrowFactoryAddress = RegistryChains.find((chain) => chain.network.chainId === chainId)
    ?.contracts.poolEscrowFactory;
  if (!poolEscrowFactoryAddress) {
    serviceError(`Pool Escrow Factory address not found. Cannot retrieve escrow address`);
    return;
  }

  const escrowAddress = await context.client.readContract({
    abi: Abis.v3.PoolEscrowFactory,
    address: poolEscrowFactoryAddress.address,
    functionName: "escrow",
    args: [poolId],
  });

  const assetQuery = await AssetService.query(context, {
    address: assetAddress,
    centrifugeId,
  });
  if (assetQuery.length !== 1) {
    serviceError(`Asset not found. Cannot retrieve assetId for holding escrow`);
    return;
  }

  const asset = assetQuery.pop();
  const { id: assetId } = asset!.read();

  const holdingEscrow = (await HoldingEscrowService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      centrifugeId,
      assetAddress,
      assetId,
      escrowAddress,
    },
    event
  )) as HoldingEscrowService;

  await holdingEscrow.setAssetPrice(assetPrice);
  await holdingEscrow.save(event);

  await snapshotter(
    context,
    event,
    "spokeV3:UpdateAssetPrice",
    [holdingEscrow],
    HoldingEscrowSnapshot
  );
});

multiMapper("spoke:InitiateTransferShares", async ({ event, context }) => {
  logEvent(event, context, "spoke:InitiateTransferShares");
  const {
    centrifugeId: toCentrifugeId,
    poolId,
    scId: tokenId,
    sender,
    destinationAddress,
    amount,
  } = event.args;

  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const [fromAccount, toAccount] = (await Promise.all([
    AccountService.getOrInit(context, { address: sender.substring(0, 42) as `0x${string}` }, event),
    AccountService.getOrInit(
      context,
      { address: destinationAddress.substring(0, 42) as `0x${string}` },
      event
    ),
  ])) as [AccountService, AccountService];

  const { address: fromAccountAddress } = fromAccount.read();
  const { address: toAccountAddress } = toAccount.read();

  const transferData = {
    poolId,
    tokenId,
    tokenAmount: amount,
    txHash: event.transaction.hash,
    centrifugeId: fromCentrifugeId,
    fromAccount: fromAccountAddress,
    toAccount: toAccountAddress,
    fromCentrifugeId: fromCentrifugeId,
    toCentrifugeId: toCentrifugeId.toString(),
  } as const;

  await Promise.all([
    InvestorTransactionService.transferOut(
      context,
      {
        ...transferData,
        account: fromAccountAddress,
      },
      event
    ),
    InvestorTransactionService.transferIn(
      context,
      {
        ...transferData,
        account: toAccountAddress,
      },
      event
    ),
  ]);
});

multiMapper("spoke:LinkVault", linkVault);
multiMapper("spoke:UnlinkVault", unlinkVault);
