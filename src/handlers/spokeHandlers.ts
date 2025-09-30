import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { VaultKinds } from "ponder:schema";
import {
  BlockchainService,
  AssetService,
  VaultService,
  TokenInstanceService,
  HoldingEscrowService,
  TokenService,
  InvestorTransactionService,
  AccountService,
} from "../services";
import { Erc20Abi } from "../../abis/Erc20Abi";
import { PoolEscrowFactoryAbi } from "../../abis/PoolEscrowFactoryAbi";
import { currentChains } from "../../ponder.config";
import { snapshotter } from "../helpers/snapshotter";
import { HoldingEscrowSnapshot } from "ponder:schema";

ponder.on("Spoke:DeployVault", async ({ event, context }) => {
  logEvent(event, context, "Spoke:DeployVault");

  const {
    poolId,
    scId: tokenId,
    asset: assetAddress,
    //tokenId: assetTokenId,
    factory,
    vault: vaultId,
    kind,
  } = event.args;

  const vaultKind = VaultKinds[kind];
  if (!vaultKind) throw new Error("Invalid vault kind");

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const { client, contracts } = context;
  const manager = await client.readContract({
    abi: contracts.Vault.abi,
    address: vaultId,
    functionName: "manager",
    args: [],
  });

  const _vault = (await VaultService.insert(
    context,
    {
      id: vaultId,
      centrifugeId,
      poolId,
      tokenId,
      assetAddress,
      factory: factory,
      kind: vaultKind,
      manager,
    },
    event.block
  )) as VaultService | null;
});

ponder.on("Spoke:RegisterAsset", async ({ event, context }) => {
  //Fires first to request registration to HUB
  logEvent(event, context, "Spoke:RegisterAsset");
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
    event.block
  )) as AssetService | null;
});

ponder.on("Spoke:AddShareClass", async ({ event, context }) => {
  logEvent(event, context, "Spoke:AddShareClass");
  const { poolId, scId: tokenId, token: tokenAddress } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const totalSupply = await context.client.readContract({
    abi: Erc20Abi,
    address: tokenAddress,
    functionName: "totalSupply",
    args: [],
  });

  console.log(`Initial totalIssuance for token ${tokenId} is ${totalSupply}`);

  const _tokenInstance = (await TokenInstanceService.getOrInit(
    context,
    {
      address: tokenAddress,
      tokenId,
      centrifugeId,
      isActive: true,
      totalIssuance: totalSupply,
    },
    event.block
  )) as TokenInstanceService;

  const token = (await TokenService.getOrInit(
    context,
    {
      id: tokenId,
      poolId,
    },
    event.block
  )) as TokenService;
  token.increaseTotalIssuance(totalSupply);
  await token.save(event.block);
});

ponder.on("Spoke:LinkVault", async ({ event, context }) => {
  logEvent(event, context, "Spoke:LinkVault");
  const {
    //poolId: poolId,
    //scId: tokenId,
    //asset: assetAddress,
    //tokenId: assetTokenId,
    vault: vaultId,
  } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) throw new Error("Vault not found");
  vault.setStatus("Linked");
  await vault.save(event.block);
});

ponder.on("Spoke:UnlinkVault", async ({ event, context }) => {
  logEvent(event, context, "Spoke:UnlinkVault");
  const { vault: vaultId } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) throw new Error("Vault not found");
  vault.setStatus("Unlinked");
  await vault.save(event.block);
});

ponder.on("Spoke:UpdateSharePrice", async ({ event, context }) => {
  logEvent(event, context, "Spoke:PriceUpdate");
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
  if (!tokenInstance)
    throw new Error("TokenInstance not found for share class");

  await tokenInstance.setTokenPrice(tokenPrice);
  await tokenInstance.setComputedAt(computedAt);
  await tokenInstance.save(event.block);
});

ponder.on("Spoke:UpdateAssetPrice", async ({ event, context }) => {
  logEvent(event, context, "Spoke:UpdateAssetPrice");

  const {
    poolId: poolId,
    scId: tokenId,
    asset: assetAddress,
    price: assetPrice,
    //computedAt,
  } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID not found");
  const poolEscrowFactoryAddress = currentChains.find(
    (chain) => chain.network.chainId === chainId
  )?.contracts.poolEscrowFactory;
  if (!poolEscrowFactoryAddress) {
    console.error(`Pool Escrow Factory address not found for chain ${chainId}`);
    return;
  }

  const escrowAddress = await context.client.readContract({
    abi: PoolEscrowFactoryAbi,
    address: poolEscrowFactoryAddress,
    functionName: "escrow",
    args: [poolId],
  });

  const assetQuery = await AssetService.query(context, {
    address: assetAddress,
    centrifugeId,
  });
  if (assetQuery.length !== 1) {
    console.error(`Asset not found for address ${assetAddress}`);
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
    event.block
  )) as HoldingEscrowService;

  await holdingEscrow.setAssetPrice(assetPrice);
  await holdingEscrow.save(event.block);

  await snapshotter(context, event, "Spoke:UpdateAssetPrice", [holdingEscrow], HoldingEscrowSnapshot);
});

ponder.on("Spoke:InitiateTransferShares", async ({ event, context }) => {
  logEvent(event, context, "Spoke:InitiateTransferShares");
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
    AccountService.getOrInit(
      context,
      { address: sender.substring(0, 42) as `0x${string}` },
      event.block
    ),
    AccountService.getOrInit(
      context,
      { address: destinationAddress.substring(0, 42) as `0x${string}` },
      event.block
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
      event.block
    ),
    InvestorTransactionService.transferIn(
      context,
      {
        ...transferData,
        account: toAccountAddress,
      },
      event.block
    ),
  ]);
});
