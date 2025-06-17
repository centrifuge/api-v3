import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { VaultKinds } from "ponder:schema";
import { BlockchainService, AssetRegistrationService, AssetService, VaultService, TokenService, TokenInstanceService } from "../services";

ponder.on("Spoke:DeployVault", async ({ event, context }) => {
  logEvent(event, "Spoke:DeployVault");
  const chainId = context.chain.id as number
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

ponder.on("Spoke:RegisterAsset", async ({ event, context }) => {
  //Fires first to request registration to HUB
  logEvent(event, "Spoke:RegisterAsset");
  const chainId = context.chain.id as number
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

  const { status } = assetRegistration.read();

  if (!status) {
    assetRegistration.setStatus("IN_PROGRESS");
    await assetRegistration.save();
  }

  const asset = (await AssetService.getOrInit(context, {
    assetRegistrationId,
    centrifugeId,
    name: name,
    symbol: symbol,
    address: assetAddress,
  })) as AssetService;
});

ponder.on("Spoke:AddShareClass", async ({ event, context }) => {
  logEvent(event, "Spoke:AddShareClass");
  const _chainId = context.chain.id as number
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

ponder.on("Spoke:LinkVault", async ({ event, context }) => {
  logEvent(event, "Spoke:LinkVault");
  const _chainId = context.chain.id as number
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

ponder.on("Spoke:UnlinkVault", async ({ event, context }) => {
  logEvent(event, "Spoke:UnlinkVault");
  const _chainId = context.chain.id as number
  const {
      poolId: _poolId,
      scId: _tokenId,
      asset: _assetAddress,
      //tokenId, TODO: Update property name
      vault: _vaultId,
    } = event.args;
    const chainId = _chainId.toString();
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

ponder.on("Spoke:UpdateSharePrice", async ({ event, context}) => {
  logEvent(event, "Spoke:PriceUpdate");
  const chainId = context.chain.id as number
  const {
    poolId: _poolId,
    scId: _tokenId,
    // tokenId: _tokenId,
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
