/**
 * Read-only asset decimal resolution (ISO → DB → hub RPC → spoke RPC).
 * Used by {@link AssetService.getDecimals}; exported for parity tests.
 */
import type { Abi } from "viem";
import { ERC20Abi } from "../../abis/ERC20";
import { getPublicClient } from "./publicClient";
import type { RegistryVersions } from "../chains";
import {
  Abis,
  getContractAddressForChain,
  getVersionForContract,
  REGISTRY_VERSION_ORDER,
} from "../contracts";
import { BlockchainService } from "../services/BlockchainService";
import { serviceLog } from "./logger";

/** Decodes centrifuge chain id from AssetId high 16 bits (protocol AssetId.sol). */
export function centrifugeIdFromAssetId(assetId: bigint): string | null {
  if (assetId === 0n) return null;
  const centrifugeId = Number((assetId >> 112n) & 0xffffn);
  return String(centrifugeId);
}

/** Optional caller context for hub chain / registry address resolution. */
export type AssetDecimalsKeys = {
  hubRegistryAddress?: `0x${string}`;
  poolCentrifugeId?: string;
};

/** Injectable dependencies for {@link resolveAssetDecimals}. */
export type AssetDecimalsDeps = {
  getAssetDecimalsFromDb: (assetId: bigint) => Promise<number | null | undefined>;
  readHubRegistryDecimals: (
    hubChainId: number,
    assetId: bigint,
    hubRegistryAddress?: `0x${string}`
  ) => Promise<number | undefined>;
  readSpokeAssetDecimals: (assetId: bigint) => Promise<number | undefined>;
};

/**
 * Resolves hub chain id for `HubRegistry.decimals` RPC.
 * @param eventChainId - `context.chain.id` from the calling handler
 * @param keys - Optional hub registry address or pool home hub centrifuge id
 * @param getChainIdFromCentrifugeId - Maps pool home hub centrifuge id to EVM chain id
 */
export function resolveHubChainId(
  eventChainId: number,
  keys: AssetDecimalsKeys | undefined,
  getChainIdFromCentrifugeId: (centrifugeId: string) => number | null
): number {
  if (keys?.hubRegistryAddress) return eventChainId;
  if (keys?.poolCentrifugeId) {
    const hubChainId = getChainIdFromCentrifugeId(keys.poolCentrifugeId);
    if (hubChainId != null) return hubChainId;
  }
  return eventChainId;
}

/**
 * Discriminated decimal resolution: ISO short-circuit, DB, then hub/spoke RPC fallbacks.
 * @param assetId - Protocol asset id
 * @param hubChainId - EVM chain id for hub registry RPC
 * @param keys - Optional hub registry contract address from the event log
 * @param deps - DB and RPC readers
 */
export async function resolveAssetDecimals(
  assetId: bigint,
  hubChainId: number,
  keys: AssetDecimalsKeys | undefined,
  deps: AssetDecimalsDeps
): Promise<number | undefined> {
  if (assetId < 1000n) return 18;

  const fromDb = await deps.getAssetDecimalsFromDb(assetId);
  if (typeof fromDb === "number") return fromDb;

  const fromHub = await deps.readHubRegistryDecimals(
    hubChainId,
    assetId,
    keys?.hubRegistryAddress
  );
  if (typeof fromHub === "number") return fromHub;

  return deps.readSpokeAssetDecimals(assetId);
}

/**
 * Revert-safe `readContract` at chain tip (not event-pinned).
 * @param fn - Async read to attempt
 */
async function readAtTipSafe<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

/**
 * Resolves deployed hub registry address and registry version on a chain.
 * @param hubChainId - Hub EVM chain id
 * @param hubRegistryAddress - Optional address from the event log
 */
function resolveHubRegistryTarget(
  hubChainId: number,
  hubRegistryAddress?: `0x${string}`
): { address: `0x${string}`; version: RegistryVersions } | null {
  if (hubRegistryAddress) {
    const version = getVersionForContract("hubRegistry", hubChainId, hubRegistryAddress);
    if (!version) return null;
    return { address: hubRegistryAddress, version };
  }
  for (let i = REGISTRY_VERSION_ORDER.length - 1; i >= 0; i--) {
    const address = getContractAddressForChain(hubChainId, i, "hubRegistry");
    if (!address) continue;
    const version = REGISTRY_VERSION_ORDER[i] as RegistryVersions;
    return { address, version };
  }
  return null;
}

/**
 * Resolves deployed spoke address and registry version on a chain.
 * @param spokeChainId - Spoke EVM chain id
 */
function resolveSpokeTarget(
  spokeChainId: number
): { address: `0x${string}`; version: RegistryVersions } | null {
  for (let i = REGISTRY_VERSION_ORDER.length - 1; i >= 0; i--) {
    const address = getContractAddressForChain(spokeChainId, i, "spoke");
    if (!address) continue;
    const version = REGISTRY_VERSION_ORDER[i] as RegistryVersions;
    return { address, version };
  }
  return null;
}

/**
 * `HubRegistry.decimals(assetId)` at chain tip.
 * @param hubChainId - Hub EVM chain id
 * @param assetId - Protocol asset id
 * @param hubRegistryAddress - Optional registry address from the handler event
 */
export async function readHubRegistryDecimalsAtTip(
  hubChainId: number,
  assetId: bigint,
  hubRegistryAddress?: `0x${string}`
): Promise<number | undefined> {
  const target = resolveHubRegistryTarget(hubChainId, hubRegistryAddress);
  if (!target) return undefined;

  serviceLog(
    `assetDecimals readHubRegistryDecimalsAtTip chainId=${hubChainId} assetId=${assetId}`
  );
  const decimals = await readAtTipSafe(() =>
    getPublicClient(hubChainId).readContract({
      address: target.address,
      abi: Abis[target.version as keyof typeof Abis].HubRegistry as Abi,
      functionName: "decimals",
      args: [assetId],
    })
  );
  return decimals === undefined ? undefined : Number(decimals);
}

/**
 * `Spoke.idToAsset` then `ERC20.decimals()` on the asset home spoke at chain tip.
 * ERC-6909 (`tokenId !== 0`) is not supported.
 * @param assetId - Protocol asset id
 */
export async function readSpokeAssetDecimalsAtTip(assetId: bigint): Promise<number | undefined> {
  const centrifugeId = centrifugeIdFromAssetId(assetId);
  if (!centrifugeId) return undefined;
  const spokeChainId = BlockchainService.getChainIdFromCentrifugeId(centrifugeId);
  if (spokeChainId == null) return undefined;

  const target = resolveSpokeTarget(spokeChainId);
  if (!target) return undefined;

  serviceLog(
    `assetDecimals readSpokeAssetDecimalsAtTip chainId=${spokeChainId} assetId=${assetId}`
  );
  const idToAsset = await readAtTipSafe(() =>
    getPublicClient(spokeChainId).readContract({
      address: target.address,
      abi: Abis[target.version as keyof typeof Abis].Spoke as Abi,
      functionName: "idToAsset",
      args: [assetId],
    })
  );
  if (idToAsset === undefined) return undefined;

  const [assetAddress, tokenId] = idToAsset as readonly [`0x${string}`, bigint];
  if (tokenId !== 0n) return undefined;

  const decimals = await readAtTipSafe(() =>
    getPublicClient(spokeChainId).readContract({
      address: assetAddress,
      abi: ERC20Abi,
      functionName: "decimals",
    })
  );
  return decimals === undefined ? undefined : Number(decimals);
}
