import type { Event, Context } from "ponder:registry";
import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError } from "../helpers/logger";
import { registerProtocolAddress } from "../helpers/protocolAddresses";
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

  const { poolId, scId: tokenId, asset: assetAddress, factory, vault: vaultId, kind } = event.args;

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
  if (manager === undefined) {
    return serviceError(`Vault manager eth_call failed. Cannot deploy vault ${vaultId}`);
  }

  const asset = await AssetService.getByTokenForVault(context, {
    centrifugeId,
    address: assetAddress,
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

  registerProtocolAddress(context.chain.id, vaultId);
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

  await VaultService.upsertSpokeAck(
    context,
    event,
    { id: vaultId, centrifugeId },
    { status: "Linked" }
  );
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

  await VaultService.upsertSpokeAck(
    context,
    event,
    { id: vaultId, centrifugeId },
    { status: "Unlinked" }
  );
}
