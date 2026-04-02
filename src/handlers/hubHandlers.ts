import type { Context, Event } from "ponder:registry";
import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError, serviceLog, expandInlineObject } from "../helpers/logger";
import { formatBytes32ToAddress } from "../helpers/formatter";
import {
  WhitelistedInvestorService,
  TokenService,
  PoolSpokeBlockchainService,
  PoolManagerService,
  AccountService,
  BlockchainService,
  centrifugeIdFromAssetId,
  VaultService,
  AssetService,
  MerkleProofManagerService,
  OffRampAddressService,
  OffRampRelayerService,
  OnRampAssetService,
  OnOffRampManagerService,
  PolicyService,
} from "../services";
import {
  decodeMerklePolicyUpdatePayload,
  decodeOnOfframpManagerTrustedCall,
  decodeSyncManagerTrustedCall,
  decodeUpdateRestriction,
  isMerklePolicyPayloadShape,
} from "../helpers/updateContractDecoders";
import { VaultCrosschainInProgressTypes } from "ponder:schema";
import { getContractNameForAddress } from "../contracts";

multiMapper("hub:NotifyPool", async ({ event, context }) => {
  logEvent(event, context, "hub:NotifyPool");
  const { poolId, centrifugeId } = event.args;

  await PoolSpokeBlockchainService.getOrInit(
    context,
    {
      poolId,
      centrifugeId: centrifugeId.toString(),
    },
    event
  );
});

multiMapper("hub:UpdateRestriction", async ({ event, context }) => {
  logEvent(event, context, "hub:UpdateRestriction");
  const { centrifugeId: spokeCentrifugeId, scId: tokenId, payload } = event.args;

  const token = (await TokenService.get(context, {
    id: tokenId,
  })) as TokenService | null;
  if (!token) {
    serviceError(`Token not found. Cannot retrieve poolId for restriction update`);
    return;
  }
  const { poolId } = token.read();

  const decodedPayload = decodeUpdateRestriction(payload);
  if (!decodedPayload) {
    serviceError("Unable to decode updateRestriction payload: ", payload);
    return;
  }

  const { accountAddress } = decodedPayload;

  const whitelistedInvestor = (await WhitelistedInvestorService.getOrInit(
    context,
    {
      poolId,
      tokenId,
      centrifugeId: spokeCentrifugeId.toString(),
      accountAddress,
    },
    event
  )) as WhitelistedInvestorService;

  switch (decodedPayload.kind) {
    case "Member":
      whitelistedInvestor.setValidUntil(decodedPayload.validUntil);
      await whitelistedInvestor.save(event);
      break;
    case "Freeze":
      whitelistedInvestor.freeze();
      await whitelistedInvestor.save(event);
      break;
    case "Unfreeze":
      whitelistedInvestor.unfreeze();
      await whitelistedInvestor.save(event);
      break;
  }
});

multiMapper("hub:UpdateBalanceSheetManager", async ({ event, context }) => {
  logEvent(event, context, "hub:UpdateBalanceSheetManager");
  const { poolId, manager: _manager, canManage, centrifugeId: spokeCentrifugeId } = event.args;
  const manager = _manager.toLowerCase().substring(0, 42) as `0x${string}`;

  const _account = (await AccountService.getOrInit(
    context,
    {
      address: manager,
    },
    event
  )) as AccountService;

  const poolManager = (await PoolManagerService.getOrInit(
    context,
    { poolId, centrifugeId: spokeCentrifugeId.toString(), address: manager },
    event,
    undefined,
    true
  )) as PoolManagerService;
  poolManager.setCrosschainInProgress(canManage ? `CanManage` : `CanNotManage`);
  await poolManager.save(event);
});

multiMapper("hub:UpdateVault", async ({ event, context }) => {
  logEvent(event, context, "hub:UpdateVault");

  const { assetId, kind, vaultOrFactory, poolId, scId: tokenId } = event.args;
  // Only track in progress for Link (1) and Unlink (2). Skip Deploy (0) for now.
  if (kind == 0)
    return serviceLog(`Skipping vault update: only Link/Unlink tracked (kind=${kind})`);

  const destCentrifugeId = centrifugeIdFromAssetId(assetId);
  if (!destCentrifugeId)
    return serviceError(`Invalid assetId. Cannot retrieve destCentrifugeId for vault update`);

  const vaultAddress: `0x${string}` = vaultOrFactory.substring(0, 42) as `0x${string}`;

  const vaultUpdateKind = VaultCrosschainInProgressTypes[kind];
  if (!vaultUpdateKind) return serviceError(`Invalid vault update kind. Cannot update vault`);

  const vault = (await VaultService.getOrInit(
    context,
    {
      id: vaultAddress,
      centrifugeId: destCentrifugeId,
      poolId,
      tokenId,
      assetId,
    },
    event,
    undefined,
    true
  )) as VaultService;
  await vault.setCrosschainInProgress(vaultUpdateKind).save(event);
});

multiMapper("hub:UpdateContract", async ({ event, context }) => {
  logEvent(event, context, "hub:UpdateContract");
  const { centrifugeId, poolId, scId: tokenId, payload, target } = event.args;
  const targetAddr = formatBytes32ToAddress(target);
  const destChainId = BlockchainService.getChainIdFromCentrifugeId(centrifugeId.toString());
  const destCentrifugeId = centrifugeId.toString();

  if (
    await handleMerklePolicyUpdate(context, event, {
      poolId,
      centrifugeId: destCentrifugeId,
      targetAddr,
      payload,
    })
  )
    return;

  if (
    await handleSyncManagerTrustedCall(context, event, {
      poolId,
      tokenId,
      centrifugeId: destCentrifugeId,
      payload,
      destChainId,
      targetAddr,
    })
  )
    return;

  if (
    await handleOnOfframpUpdate(context, event, {
      poolId,
      tokenId,
      centrifugeId: destCentrifugeId,
      payload,
      targetAddr,
    })
  )
    return;
});

/** Placeholder root until spoke `UpdatePolicy` finalizes the Merkle root. */
const ZERO_POLICY_ROOT =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

type HubUpdateContractBase = {
  poolId: bigint;
  tokenId: `0x${string}`;
  centrifugeId: string;
  payload: `0x${string}`;
};

/** Merkle policy path: returns `false` if payload is not Merkle-shaped; `true` if handled (including logged errors). */
async function handleMerklePolicyUpdate(
  context: Context,
  event: Event,
  input: Pick<HubUpdateContractBase, "poolId" | "centrifugeId" | "payload"> & {
    targetAddr: `0x${string}`;
  }
): Promise<boolean> {
  const { poolId, centrifugeId, targetAddr, payload } = input;
  if (!isMerklePolicyPayloadShape(payload)) return false;

  const strategistAddress = decodeMerklePolicyUpdatePayload(payload);
  if (!strategistAddress) {
    serviceError(`Invalid Merkle policy update payload for manager ${targetAddr}: ${payload}`);
    return true;
  }
  const mpm = (await MerkleProofManagerService.get(context, {
    poolId,
    address: targetAddr,
    centrifugeId,
  })) as MerkleProofManagerService | null;
  if (!mpm) {
    serviceError(`MerkleProofManager not found for address ${targetAddr}. Cannot update policy`);
    return true;
  }
  const policy = (await PolicyService.getOrInit(
    context,
    {
      poolId,
      centrifugeId,
      strategistAddress,
      root: ZERO_POLICY_ROOT,
    },
    event,
    undefined,
    true
  )) as PolicyService;
  await policy.setCrosschainInProgress("UpdatePolicy").save(event);
  return true;
}

/** Sync manager path: `false` if target is not `syncManager` in the registry; `true` if handled. */
async function handleSyncManagerTrustedCall(
  context: Context,
  event: Event,
  input: HubUpdateContractBase & {
    destChainId: number | null;
    targetAddr: `0x${string}`;
  }
): Promise<boolean> {
  const { poolId, tokenId, centrifugeId, payload, destChainId, targetAddr } = input;
  const registryName =
    destChainId != null ? getContractNameForAddress(destChainId, targetAddr) : null;
  if (registryName !== "syncManager") return false;

  const decoded = decodeSyncManagerTrustedCall(payload);
  if (!decoded || decoded.kind !== "MaxReserve") return true;

  const { assetId, maxReserve } = decoded;
  const asset = await AssetService.get(context, { id: assetId });
  if (!asset) {
    serviceError(`Asset not found for assetId ${assetId}. Cannot update vault maxReserve`);
    return true;
  }
  const rawAssetAddress = asset.read().address as `0x${string}`;
  if (!rawAssetAddress) {
    serviceError(`Asset has no address for assetId ${assetId}`);
    return true;
  }
  const assetAddress = formatBytes32ToAddress(rawAssetAddress);

  const vault = (await VaultService.get(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetAddress,
  })) as VaultService | null;
  if (!vault) {
    serviceError(`Vault not found. Cannot update maxReserve`);
    return true;
  }
  await vault.setMaxReserve(maxReserve).setCrosschainInProgress().save(event);
  return true;
}

/**
 * On/off-ramp manager path: `false` if there is no indexed manager for `targetAddr` or the payload
 * is not an on/off-ramp trusted call; `true` if handled. No static-registry guard: manager
 * addresses are factory-deployed and absent from `chain.contracts`, while hub/vault/etc. are not
 * stored as `OnOffRampManager` rows.
 */
async function handleOnOfframpUpdate(
  context: Context,
  event: Event,
  input: HubUpdateContractBase & { targetAddr: `0x${string}` }
): Promise<boolean> {
  const { poolId, tokenId, centrifugeId, payload, targetAddr } = input;

  const hasOnOffRampManager = await OnOffRampManagerService.get(context, {
    address: targetAddr,
    centrifugeId,
  });
  if (!hasOnOffRampManager) return false;

  const decoded = decodeOnOfframpManagerTrustedCall(payload);
  if (!decoded) return false;
  if (decoded.kind === "Withdraw") return true;

  serviceLog(`Decoded OnOfframp UpdateContract payload: ${expandInlineObject(decoded)}`);

  if (decoded.kind === "Onramp") {
    const { assetId, isEnabled } = decoded;
    const asset = await AssetService.get(context, { id: assetId });
    if (!asset) {
      serviceError(`Asset not found for assetId ${assetId}. Cannot update onramp`);
      return true;
    }
    const assetAddress = asset.read().address as `0x${string}`;
    if (!assetAddress) {
      serviceError(`Asset has no address for assetId ${assetId}`);
      return true;
    }
    const onRampAsset = (await OnRampAssetService.getOrInit(
      context,
      { poolId, centrifugeId, tokenId, assetAddress },
      event,
      undefined,
      true
    )) as OnRampAssetService;
    await onRampAsset.setCrosschainInProgress(isEnabled ? "Enabled" : "Disabled").save(event);
    return true;
  }

  if (decoded.kind === "Relayer") {
    const { relayerAddress, isEnabled } = decoded;
    const offrampRelayer = (await OffRampRelayerService.getOrInit(
      context,
      {
        poolId,
        centrifugeId,
        tokenId,
        address: formatBytes32ToAddress(relayerAddress),
      },
      event,
      undefined,
      true
    )) as OffRampRelayerService;
    await offrampRelayer.setCrosschainInProgress(isEnabled ? "Enabled" : "Disabled").save(event);
    return true;
  }

  const { assetId, receiverAddress, isEnabled } = decoded;
  const asset = await AssetService.get(context, { id: assetId });
  if (!asset) {
    serviceError(`Asset not found for assetId ${assetId}. Cannot update offramp`);
    return true;
  }
  const rawAssetAddress = asset.read().address as `0x${string}`;
  if (!rawAssetAddress) {
    serviceError(`Asset has no address for assetId ${assetId}`);
    return true;
  }
  const offrampAddress = (await OffRampAddressService.getOrInit(
    context,
    {
      poolId,
      centrifugeId,
      tokenId,
      assetAddress: formatBytes32ToAddress(rawAssetAddress),
      receiverAddress: formatBytes32ToAddress(receiverAddress),
    },
    event,
    undefined,
    true
  )) as OffRampAddressService;
  await offrampAddress.setCrosschainInProgress(isEnabled ? "Enabled" : "Disabled").save(event);
  return true;
}
