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

  const [restrictionType, accountAddress, validUntil] = decodedPayload;

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

  switch (restrictionType) {
    case RestrictionType.Member:
      whitelistedInvestor.setValidUntil(validUntil);
      await whitelistedInvestor.save(event);
      break;
    case RestrictionType.Freeze:
      whitelistedInvestor.freeze();
      await whitelistedInvestor.save(event);
      break;
    case RestrictionType.Unfreeze:
      whitelistedInvestor.unfreeze();
      await whitelistedInvestor.save(event);
      break;
    default:
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

  if (isMerklePolicyPayloadShape(payload)) {
    await handleMerklePolicyUpdate(context, event, {
      poolId,
      centrifugeId: destCentrifugeId,
      targetAddr,
      payload,
    });
    return;
  }

  const registryName =
    destChainId != null ? getContractNameForAddress(destChainId, targetAddr) : null;

  if (registryName === "syncManager") {
    await handleSyncManagerTrustedCall(context, event, {
      poolId,
      tokenId,
      centrifugeId: destCentrifugeId,
      payload,
    });
    return;
  }

  if (registryName !== null) return;

  await handleOnOfframpUpdate(context, event, {
    poolId,
    tokenId,
    centrifugeId: destCentrifugeId,
    payload,
    targetAddr,
  });
});

enum RestrictionType {
  "Invalid",
  "Member",
  "Freeze",
  "Unfreeze",
}

/**
 * Decodes the update restriction payload into its parameters.
 * @param payload - The payload to decode.
 * @returns The decoded parameters.
 */
function decodeUpdateRestriction(
  payload: `0x${string}`
):
  | [
      restrictionType: (typeof RestrictionType)[keyof typeof RestrictionType],
      accountAddress: `0x${string}`,
      validUntil: Date | null,
    ]
  | null {
  const buffer = Buffer.from(payload.slice(2), "hex");
  const restrictionType = buffer.readUInt8(0);
  const accountBuffer = buffer.subarray(1, 32);
  const accountAddress = `0x${accountBuffer.toString("hex").slice(0, 40)}` as `0x${string}`;
  switch (restrictionType) {
    case RestrictionType.Member:
      const _validUntil = Number(buffer.readBigUInt64BE(33) * 1000n);
      const validUntil = Number.isSafeInteger(_validUntil)
        ? new Date(Number(_validUntil))
        : new Date("9999-12-31T23:59:59Z");
      return [restrictionType, accountAddress, validUntil];
    case RestrictionType.Freeze:
      return [restrictionType, accountAddress, null];
    case RestrictionType.Unfreeze:
      return [restrictionType, accountAddress, null];
    default:
      return null;
  }
}

/** Placeholder root until spoke `UpdatePolicy` finalizes the Merkle root. */
const ZERO_POLICY_ROOT =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

type HubUpdateContractBase = {
  poolId: bigint;
  tokenId: `0x${string}`;
  centrifugeId: string;
  payload: `0x${string}`;
};

/** Merkle policy path: caller must have matched `isMerklePolicyPayloadShape(payload)` first. */
async function handleMerklePolicyUpdate(
  context: Context,
  event: Event,
  input: Pick<HubUpdateContractBase, "poolId" | "centrifugeId" | "payload"> & {
    targetAddr: `0x${string}`;
  }
): Promise<void> {
  const { poolId, centrifugeId, targetAddr, payload } = input;
  const strategistAddress = decodeMerklePolicyUpdatePayload(payload);
  if (!strategistAddress) {
    return serviceError(
      `Invalid Merkle policy update payload for manager ${targetAddr}: ${payload}`
    );
  }
  const mpm = (await MerkleProofManagerService.get(context, {
    poolId,
    address: targetAddr,
    centrifugeId,
  })) as MerkleProofManagerService | null;
  if (!mpm) {
    return serviceError(
      `MerkleProofManager not found for address ${targetAddr}. Cannot update policy`
    );
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
}

/** Sync manager trusted call: only `MaxReserve` updates vault state; other decodes no-op. */
async function handleSyncManagerTrustedCall(
  context: Context,
  event: Event,
  input: HubUpdateContractBase
): Promise<void> {
  const { poolId, tokenId, centrifugeId, payload } = input;
  const decoded = decodeSyncManagerTrustedCall(payload);
  if (!decoded || decoded.kind !== "MaxReserve") return;

  const { assetId, maxReserve } = decoded;
  const asset = await AssetService.get(context, { id: assetId });
  if (!asset) {
    return serviceError(`Asset not found for assetId ${assetId}. Cannot update vault maxReserve`);
  }
  const rawAssetAddress = asset.read().address as `0x${string}`;
  if (!rawAssetAddress) return serviceError(`Asset has no address for assetId ${assetId}`);
  const assetAddress = formatBytes32ToAddress(rawAssetAddress);

  const vault = (await VaultService.get(context, {
    centrifugeId,
    poolId,
    tokenId,
    assetAddress,
  })) as VaultService | null;
  if (!vault) return serviceError(`Vault not found. Cannot update maxReserve`);
  await vault.setMaxReserve(maxReserve).setCrosschainInProgress().save(event);
}

/**
 * On/off-ramp manager path: requires a row for `(targetAddr, centrifugeId)`; decodes trusted call
 * and updates onramp / relayer / offramp entities when applicable.
 */
async function handleOnOfframpUpdate(
  context: Context,
  event: Event,
  input: HubUpdateContractBase & { targetAddr: `0x${string}` }
): Promise<void> {
  const { poolId, tokenId, centrifugeId, payload, targetAddr } = input;

  const hasOnOffRampManager = await OnOffRampManagerService.get(context, {
    address: targetAddr,
    centrifugeId,
  });
  if (!hasOnOffRampManager) return;

  const decoded = decodeOnOfframpManagerTrustedCall(payload);
  if (!decoded) return;
  if (decoded.kind === "Withdraw") return;

  serviceLog(`Decoded OnOfframp UpdateContract payload: ${expandInlineObject(decoded)}`);

  if (decoded.kind === "Onramp") {
    const { assetId, isEnabled } = decoded;
    const asset = await AssetService.get(context, { id: assetId });
    if (!asset) {
      return serviceError(`Asset not found for assetId ${assetId}. Cannot update onramp`);
    }
    const assetAddress = asset.read().address as `0x${string}`;
    if (!assetAddress) return serviceError(`Asset has no address for assetId ${assetId}`);
    const onRampAsset = (await OnRampAssetService.getOrInit(
      context,
      { poolId, centrifugeId, tokenId, assetAddress },
      event,
      undefined,
      true
    )) as OnRampAssetService;
    await onRampAsset.setCrosschainInProgress(isEnabled ? "Enabled" : "Disabled").save(event);
    return;
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
    return;
  }

  const { assetId, receiverAddress, isEnabled } = decoded;
  const asset = await AssetService.get(context, { id: assetId });
  if (!asset) {
    return serviceError(`Asset not found for assetId ${assetId}. Cannot update offramp`);
  }
  const rawAssetAddress = asset.read().address as `0x${string}`;
  if (!rawAssetAddress) return serviceError(`Asset has no address for assetId ${assetId}`);
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
}
