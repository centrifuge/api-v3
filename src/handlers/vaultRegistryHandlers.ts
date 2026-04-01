import type { Event, Context } from "ponder:registry";
import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError } from "../helpers/logger";
import { VaultKinds } from "ponder:schema";
import { BlockchainService, AssetService, VaultService } from "../services";
import { getContractNameForAddress } from "../contracts";
import { readContractSafe } from "../helpers/readContractSafe";

multiMapper("vaultRegistry:DeployVault", deployVault);
export async function deployVault({
  event,
  context,
}: {
  event: Event<"vaultRegistryV3_1:DeployVault" | "spokeV3:DeployVault">;
  context: Context;
}) {
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
  if (!contractName) return serviceError(`Contract name not found. Cannot deploy vault`);
  const vaultKind = VaultKinds[kind];
  if (!vaultKind) return serviceError("Invalid vault kind. Cannot deploy vault");

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const { contracts } = context;
  const manager =
    contractName === "vaultRegistry"
      ? await readContractSafe(context, event, {
          abi: contracts.vaultV3_1.abi,
          address: vaultId,
          functionName: "baseManager",
          args: [],
        })
      : await readContractSafe(context, event, {
          abi: contracts.vaultV3.abi,
          address: vaultId,
          functionName: "manager",
          args: [],
        });

  const asset = await AssetService.get(context, {
    address: assetAddress,
    centrifugeId,
  });
  if (!asset) return serviceError(`Asset not found. Cannot retrieve assetId for vault deployment`);

  const { id: assetId } = asset.read();
  if (!assetId) return serviceError(`Asset ID not found. Cannot deploy vault`);

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
      status: "Unlinked",
      crosschainInProgress: null,
      maxReserve: 2n ** 128n - 1n,
    },
    event
  )) as VaultService;
}

multiMapper("vaultRegistry:LinkVault", linkVault);
export async function linkVault({
  event,
  context,
}: {
  event: Event<"spokeV3:LinkVault" | "vaultRegistryV3_1:LinkVault">;
  context: Context;
}) {
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
  await vault.setStatus("Linked").setCrosschainInProgress().save(event);
}

multiMapper("vaultRegistry:UnlinkVault", unlinkVault);
export async function unlinkVault({
  event,
  context,
}: {
  event: Event<"spokeV3:UnlinkVault" | "vaultRegistryV3_1:UnlinkVault">;
  context: Context;
}) {
  logEvent(event, context, "spoke:UnlinkVault");
  const { vault: vaultId } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const vault = (await VaultService.get(context, {
    id: vaultId,
    centrifugeId,
  })) as VaultService;
  if (!vault) return serviceError(`Vault not found. Cannot unlink vault`);
  await vault.setStatus("Unlinked").setCrosschainInProgress().save(event);
}
