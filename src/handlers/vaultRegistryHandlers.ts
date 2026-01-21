import type { Event, Context } from "ponder:registry";
import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError } from "../helpers/logger";
import { VaultKinds } from "ponder:schema";
import { BlockchainService, AssetService, VaultService } from "../services";
import { getContractNameForAddress } from "../contracts";

multiMapper("vaultRegistry:DeployVault", deployVault);
export async function deployVault({ event, context }: { event: Event<"vaultRegistryV3_1:DeployVault" | "spokeV3:DeployVault">, context: Context }) {
  logEvent(event, context, "spoke:DeployVault");

  const {
    poolId,
    scId: tokenId,
    asset: assetAddress,
    //tokenId: assetTokenId,
    factory,
    vault: vaultId,
    kind,
  } = event.args;

  const contractName = getContractNameForAddress(context.chain.id, event.log.address);
  const vaultKind = VaultKinds[kind];
  if (!vaultKind) return serviceError("Invalid vault kind");

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const { client, contracts } = context;
  const manager = await client.readContract({
    abi: contractName === "vaultRegistry" ? contracts.vaultV3_1.abi : contracts.vaultV3.abi,
    address: vaultId,
    functionName: contractName === "vaultRegistry" ? "baseManager" : "manager",
    args: [],
  });

  const asset = await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  });
  if (!asset) {
    serviceError(`Asset not found. Cannot retrieve assetId for vault deployment`);
    return;
  }
  const { id: assetId } = asset.read();
  if (!assetId) {
    serviceError(`Asset ID not found. Cannot deploy vault`);
    return;
  }

  const _vault = (await VaultService.upsert(
    context,
    {
      id: vaultId,
      centrifugeId,
      poolId,
      tokenId,
      assetId,
      assetAddress,
      factory: factory,
      kind: vaultKind,
      manager,
      isActive: true,
    },
    event
  )) as VaultService;
}

multiMapper("vaultRegistry:LinkVault", linkVault);
export async function linkVault({ event, context }: { event: Event<"spokeV3:LinkVault" | "vaultRegistryV3_1:LinkVault">, context: Context }) {
  logEvent(event, context, "spoke:LinkVault");
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
  if (!vault) {
    serviceError(`Vault not found. Cannot link vault`);
    return;
  }
  vault.setStatus("Linked");
  await vault.save(event);
}

multiMapper("vaultRegistry:UnlinkVault", unlinkVault);
export async function unlinkVault({ event, context }: { event: Event<"spokeV3:UnlinkVault" | "vaultRegistryV3_1:UnlinkVault">, context: Context }) {
  logEvent(event, context, "spoke:UnlinkVault");
  const { vault: vaultId } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) return serviceError(`Vault not found. Cannot unlink vault`);
  vault.setStatus("Unlinked");
  await vault.save(event);
}