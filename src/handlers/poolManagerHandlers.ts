import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { VaultService } from "../services/VaultService";
import { AssetService } from "../services/AssetService";
import { LocalAssetService } from "../services/LocalAssetService";
import { VaultKinds } from "ponder:schema";
import { BlockchainService } from "../services/BlockchainService";
import { ShareClassService } from "../services";
import { TokenService } from "../services/TokenService";

ponder.on("PoolManager:DeployVault", async ({ event, context }) => {
  logEvent(event, "PoolManager:DeployVault");
  const { chainId } = context.network;
  const {
    poolId,
    scId: _shareClassId,
    asset: _localAssetAddress,
    tokenId: _tokenId,
    factory: _factory,
    vault: _vaultId,
    kind,
  } = event.args;
  const shareClassId = _shareClassId.toString();
  const localAssetAddress = _localAssetAddress.toString();
  const tokenId = _tokenId.toString();
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
    poolId: poolId.toString(),
    shareClassId: shareClassId,
    localAssetAddress: localAssetAddress,
    factory: factory,
    kind: vaultKind,
    tokenId
  })) as VaultService;
});

ponder.on("PoolManager:RegisterAsset", async ({ event, context }) => {
  //Fires first to request registration to HUB
  logEvent(event, "PoolManager:RegisterAsset");
  const { chainId } = context.network;
  const {
    assetId: _assetId,
    asset: _localAssetAddress,
    tokenId: _tokenId,
    name,
    symbol,
    decimals,
  } = event.args;
  const assetId = _assetId.toString();
  const localAssetAddress = _localAssetAddress.toString();
  const tokenId = _tokenId.toString();
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  const asset = (await AssetService.getOrInit(context, {
    id: assetId,
    centrifugeId,
    decimals: decimals,
    tokenId: tokenId,
    name: name,
    symbol: symbol,
  })) as AssetService;


  const localAsset = (await LocalAssetService.getOrInit(context, {
    assetId,
    centrifugeId,
    name: name,
    symbol: symbol,
    address: localAssetAddress,
  })) as LocalAssetService;

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
    scId: _shareClassId,
    token: _tokenAddress
  } = event.args;
  const chainId = _chainId.toString();
  const poolId = _poolId.toString();
  const shareClassId = _shareClassId.toString();
  const tokenAddress = _tokenAddress.toString();
  const blockchain = (await BlockchainService.get(context, {
    id: chainId,
  })) as BlockchainService;
  const { centrifugeId } = blockchain.read();

  const token = await TokenService.init(context, {
    address: tokenAddress,
    centrifugeId,
    poolId,
    shareClassId,
  }) as TokenService;
});

ponder.on("PoolManager:LinkVault", async ({ event, context }) => {
  logEvent(event, "PoolManager:LinkVault");
  const {
    poolId: _poolId,
    scId: _shareClassId,
    asset: _localAssetAddress,
    tokenId,
    vault: _vaultId,
  } = event.args;
  const poolId = _poolId.toString();
  const shareClassId = _shareClassId.toString();
  const localAssetAddress = _localAssetAddress.toString();
  const vaultId = _vaultId.toString();

  const vault = (await VaultService.get(context, {
    id: vaultId,
  })) as VaultService;

  vault.setStatus("Linked");
  await vault.save();
  });

ponder.on("PoolManager:UnlinkVault", async ({ event, context }) => {
  logEvent(event, "PoolManager:UnlinkVault");
  const { chainId } = context.network;
  const {
      poolId: _poolId,
      scId: _shareClassId,
      asset: _localAssetAddress,
      tokenId,
      vault: _vaultId,
    } = event.args;
    const poolId = _poolId.toString();
    const shareClassId = _shareClassId.toString();
    const localAssetAddress = _localAssetAddress.toString();
    const vaultId = _vaultId.toString();
  
    const vault = (await VaultService.get(context, {
      id: vaultId,
  })) as VaultService;

  vault.setStatus("Unlinked");
  await vault.save();
});
