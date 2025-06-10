import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { VaultKinds } from "ponder:schema";
import { BlockchainService, AssetRegistrationService, AssetService, VaultService, TokenService, TokenInstanceService } from "../services";

ponder.on("PoolManager:DeployVault", async ({ event, context }) => {
  logEvent(event, "PoolManager:DeployVault");
  const { chainId } = context.network;
  const {
    poolId: _poolId,
    scId: _shareClassId,
    asset: _assetAddress,
    tokenId: _tokenId,
    factory: _factory,
    vault: _vaultId,
    kind,
  } = event.args;
  const poolId = _poolId.toString()
  const tokenId = _shareClassId.toString();
  const assetAddress = _assetAddress.toString();
  //const tokenId = _tokenId.toString(); TODO: update to track ERC tokens
  const factory = _factory.toString();
  const vaultId = _vaultId.toString();
  const vaultKind = VaultKinds[kind];
  if (!vaultKind) throw new Error("Invalid vault kind");

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  const vault = (await VaultService.init(context, {
    id: vaultId,
    centrifugeId,
    poolId: poolId,
    tokenId: tokenId,
    assetAddress,
    factory: factory,
    kind: vaultKind,
    //tokenId
  })) as VaultService;
});

ponder.on("PoolManager:RegisterAsset", async ({ event, context }) => {
  //Fires first to request registration to HUB
  logEvent(event, "PoolManager:RegisterAsset");
  const { chainId } = context.network;
  const {
    assetId: _assetRegistrationId,
    asset: _assetAddress,
    tokenId: _tokenId,
    name,
    symbol,
    decimals,
  } = event.args;
  const assetRegistrationId = _assetRegistrationId.toString();
  const assetAddress = _assetAddress.toString();
  const tokenId = _tokenId.toString();
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  const assetRegistration = (await AssetRegistrationService.getOrInit(context, {
    assetId: assetRegistrationId,
    centrifugeId,
    decimals: decimals,
    name: name,
    symbol: symbol,
  })) as AssetRegistrationService;


  const localAsset = (await AssetService.getOrInit(context, {
    assetRegistrationId,
    centrifugeId,
    name: name,
    symbol: symbol,
    address: assetAddress,
  })) as AssetService;

  const { status } = localAsset.read();

  if (!status) {
    localAsset.setStatus("IN_PROGRESS");
    await localAsset.save();
  }
});

ponder.on("PoolManager:AddShareClass", async ({ event, context }) => {
  logEvent(event, "PoolManager:AddShareClass");
  const { chainId: _chainId } = context.network;
  const {
    poolId: _poolId,
    scId: _tokenId,
    token: _tokenAddress
  } = event.args;
  const chainId = _chainId.toString();
  const tokenId = _tokenId.toString();
  const tokenAddress = _tokenAddress.toString();
  const blockchain = (await BlockchainService.get(context, {
    id: chainId,
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  const tokenInstance = await TokenInstanceService.getOrInit(context, {
    address: tokenAddress,
    tokenId,
    centrifugeId,
  }) as TokenInstanceService;
});

ponder.on("PoolManager:LinkVault", async ({ event, context }) => {
  logEvent(event, "PoolManager:LinkVault");
  const { chainId: _chainId } = context.network;
  const {
    poolId: _poolId,
    scId: _tokenId,
    asset: _assetAddress,
    //tokenId: _tokenId, TODO: Update property name
    vault: _vaultId,
  } = event.args;
  const chainId = _chainId.toString();
  const poolId = _poolId.toString();
  const tokenId = _tokenId.toString();
  const assetAddress = _assetAddress.toString();
  const vaultId = _vaultId.toString();
  //const tokenId = _tokenId.toString(); TODO: Update property name
  const vault = (await VaultService.get(context, {
    id: vaultId,
  })) as VaultService;

  const blockchain = (await BlockchainService.get(context, {
    id: chainId,
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  vault.setStatus("Linked");
  await vault.save();

  const tokenInstance = (await TokenInstanceService.query(context, {
    tokenId,
    centrifugeId,
  }) as TokenInstanceService[]).pop();

  if (!tokenInstance) throw new Error("TokenInstance not found for share class");

  tokenInstance.setVaultId(vaultId);
  tokenInstance.setTokenId(tokenId);
  await tokenInstance.save();
});

ponder.on("PoolManager:UnlinkVault", async ({ event, context }) => {
  logEvent(event, "PoolManager:UnlinkVault");
  const { chainId } = context.network;
  const {
      poolId: _poolId,
      scId: _tokenId,
      asset: _assetAddress,
      //tokenId, TODO: Update property name
      vault: _vaultId,
    } = event.args;
    const poolId = _poolId.toString();
    const tokenId = _tokenId.toString();
    const assetAddress = _assetAddress.toString();
    const vaultId = _vaultId.toString();
  
    const vault = (await VaultService.get(context, {
      id: vaultId,
  })) as VaultService;

  vault.setStatus("Unlinked");
  await vault.save();
});

ponder.on("PoolManager:PriceUpdate(uint64 indexed poolId, bytes16 indexed scId, address indexed asset, uint256 tokenId, uint256 price, uint64 computedAt)", async ({ event, context}) => {
  logEvent(event, "PoolManager:PriceUpdate");
  const { chainId } = context.network;
  const {
    poolId: _poolId,
    scId: _tokenId,
    asset: _assetAddress,
    // tokenId: _tokenId,
    price: tokenPrice,
    computedAt: _computedAt,
  } = event.args;
  const poolId = _poolId.toString();
  const tokenId = _tokenId.toString();
  const assetAddress = _assetAddress.toString();
  const computedAt = new Date(Number(_computedAt.toString())*1000);

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  const tokenInstance = (await TokenInstanceService.get(context, {
    tokenId,
    centrifugeId,
  })) as TokenInstanceService;

  if (!tokenInstance) throw new Error("TokenInstance not found for share class");

  await tokenInstance.setTokenPrice(tokenPrice);
  await tokenInstance.setComputedAt(computedAt);
  await tokenInstance.save();
})

ponder.on("PoolManager:PriceUpdate(uint64 indexed poolId, bytes16 indexed scId, uint256 price, uint64 computedAt)", async ({ event, context}) => {
  logEvent(event, "PoolManager:PriceUpdate");
  const { chainId } = context.network;
  const {
    poolId: _poolId,
    scId: _tokenId,
    price: tokenPrice,
    computedAt: _computedAt,
  } = event.args;
  const poolId = _poolId.toString();
  const tokenId = _tokenId.toString();
  const computedAt = new Date(Number(_computedAt.toString())*1000);

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  const tokenInstance = (await TokenInstanceService.get(context, {
    tokenId,
    centrifugeId,
  })) as TokenInstanceService;

  if (!tokenInstance) throw new Error("TokenInstance not found for share class");

  await tokenInstance.setTokenPrice(tokenPrice);
  await tokenInstance.setComputedAt(computedAt);
  await tokenInstance.save();
})
