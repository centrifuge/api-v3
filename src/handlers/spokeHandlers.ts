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
} from "../services";
import { Erc20Abi } from "../../abis/Erc20Abi";

ponder.on("Spoke:DeployVault", async ({ event, context }) => {
  logEvent(event, context, "Spoke:DeployVault");
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
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

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

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
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const {
    assetId,
    asset: assetAddress,
    tokenId: assetTokenId,
    name,
    symbol,
    decimals,
  } = event.args;
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();
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
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const {
    poolId,
    scId: tokenId,
    token: tokenAddress,
  } = event.args;
  const chainId = _chainId.toString();

  const blockchain = (await BlockchainService.get(context, {
    id: chainId,
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

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
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const {
    //poolId: poolId,
    //scId: tokenId,
    //asset: assetAddress,
    //tokenId: assetTokenId,
    vault: vaultId,
  } = event.args;

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
  vault.setStatus("Linked");
  await vault.save(event.block);
});

ponder.on("Spoke:UnlinkVault", async ({ event, context }) => {
  logEvent(event, context, "Spoke:UnlinkVault");
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const { vault: vaultId } = event.args;

  const chainId = _chainId.toString();
  const blockchain = (await BlockchainService.get(context, {
    id: chainId,
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

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
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const {
    //poolId,
    scId: tokenId,
    // tokenId: _tokenId,
    price: tokenPrice,
    computedAt: _computedAt,
  } = event.args;
  const computedAt = new Date(Number(_computedAt.toString()) * 1000);

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

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
  const _chainId = context.chain.id;
  if (typeof _chainId !== "number") throw new Error("Chain ID is required");
  const {
    //poolId: poolId,
    //scId: tokenId,
    asset: assetAddress,
    price: assetPrice,
    //computedAt,
  } = event.args;

  const chainId = _chainId.toString();
  const blockchain = (await BlockchainService.get(context, {
    id: chainId,
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

  const holdingEscrows = (await HoldingEscrowService.query(context, {
    centrifugeId,
    assetAddress,
  })) as HoldingEscrowService[];

  for (const holdingEscrow of holdingEscrows) {
    await holdingEscrow.setAssetPrice(assetPrice);
    await holdingEscrow.save(event.block);
  }
});
