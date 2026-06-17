/**
 * Unified decimal resolution for share classes and pool assets at entity init only.
 * Runtime handlers read persisted `decimals` from entity `.read()`.
 */
import type { Context, Event } from "ponder:registry";
import type { Abi } from "viem";
import { ERC20Abi } from "../../abis/ERC20";
import type { RegistryVersions } from "../chains";
import {
  Abis,
  getContractAddressForChain,
  getVersionForContract,
  REGISTRY_VERSION_ORDER,
} from "../contracts";
import { AssetService } from "../services/AssetService";
import { BlockchainService } from "../services/BlockchainService";
import { PoolService } from "../services/PoolService";
import { TokenInstanceService } from "../services/TokenInstanceService";
import { TokenService } from "../services/TokenService";
import { readContractSafe } from "./readContractSafe";
import { getPublicClient } from "./publicClient";
import { serviceLog } from "./logger";

/** ERC-6909 token id for standard ERC-20 assets (`tokenId = 0`). */
const ERC20_ASSET_TOKEN_ID = 0n;

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
 * Identifies a share class or pool asset for decimal resolution.
 * Provide any combination of protocol ids or on-chain `(address, chainId)` pairs.
 */
export type DecimalsResolverQuery = {
  tokenId?: `0x${string}`;
  tokenAddress?: `0x${string}`;
  assetId?: bigint;
  assetAddress?: `0x${string}`;
  chainId?: number;
  centrifugeId?: string;
  assetTokenId?: bigint;
  poolId?: bigint;
  hubRegistryAddress?: `0x${string}`;
  poolCentrifugeId?: string;
  /** Pin ERC-20 `decimals()` to the handler event block (deploy/init). */
  pinToEvent?: boolean;
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
 * Asset decimal resolution: ISO short-circuit, DB, then hub/spoke RPC fallbacks.
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
    `decimalsResolver readHubRegistryDecimalsAtTip chainId=${hubChainId} assetId=${assetId}`
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
    `decimalsResolver readSpokeAssetDecimalsAtTip chainId=${spokeChainId} assetId=${assetId}`
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

/**
 * Resolves hub/spoke chain context for a query.
 * @param context - Ponder context
 * @param query - Resolver query
 */
async function resolveChainContext(
  context: Context,
  query: DecimalsResolverQuery
): Promise<{ chainId: number; centrifugeId: string }> {
  const chainId = query.chainId ?? context.chain.id;
  const centrifugeId =
    query.centrifugeId ??
    BlockchainService.getCentrifugeIdFromChainId(chainId) ??
    (await BlockchainService.getCentrifugeId(context));
  return { chainId, centrifugeId };
}

/**
 * Reads `ERC20.decimals()` at event block or chain tip.
 * @param chainId - EVM chain id
 * @param address - Token contract address
 * @param context - Ponder context
 * @param event - Handler event
 * @param pinToEvent - When true, use event-pinned read
 */
async function readErc20Decimals(
  chainId: number,
  address: `0x${string}`,
  context: Context,
  event: Event,
  pinToEvent?: boolean
): Promise<number | undefined> {
  if (pinToEvent) {
    const pinned = await readContractSafe(context, event, {
      abi: ERC20Abi,
      address,
      functionName: "decimals",
    });
    return pinned === undefined ? undefined : Number(pinned);
  }
  const decimals = await readAtTipSafe(() =>
    getPublicClient(chainId).readContract({
      address,
      abi: ERC20Abi,
      functionName: "decimals",
    })
  );
  return decimals === undefined ? undefined : Number(decimals);
}

/**
 * Resolves decimals for a protocol `assetId` (ISO → DB → hub RPC → asset-home spoke RPC).
 */
async function resolveFromAssetId(
  context: Context,
  _event: Event,
  chainId: number,
  assetId: bigint,
  query: DecimalsResolverQuery
): Promise<number | undefined> {
  const assetKeys: AssetDecimalsKeys = {
    hubRegistryAddress: query.hubRegistryAddress,
    poolCentrifugeId: query.poolCentrifugeId ?? query.centrifugeId,
  };
  const hubChainId = resolveHubChainId(
    chainId,
    assetKeys,
    BlockchainService.getChainIdFromCentrifugeId
  );
  return resolveAssetDecimals(assetId, hubChainId, assetKeys, {
    getAssetDecimalsFromDb: async (id) => {
      const asset = (await AssetService.get(context, { id })) as InstanceType<
        typeof AssetService
      > | null;
      if (!asset) return undefined;
      const { decimals } = asset.read();
      return typeof decimals === "number" ? decimals : undefined;
    },
    readHubRegistryDecimals: readHubRegistryDecimalsAtTip,
    readSpokeAssetDecimals: readSpokeAssetDecimalsAtTip,
  });
}

/**
 * Resolves decimals for `(assetAddress, chain)` via indexed asset row or ERC-20 RPC.
 */
async function resolveFromAssetAddress(
  context: Context,
  event: Event,
  chainId: number,
  centrifugeId: string,
  assetAddress: `0x${string}`,
  assetTokenId: bigint,
  pinToEvent?: boolean
): Promise<number | undefined> {
  const asset = await AssetService.getByToken(context, {
    centrifugeId,
    address: assetAddress,
    assetTokenId,
  });
  if (asset) {
    const { decimals } = asset.read();
    if (typeof decimals === "number") return decimals;
  }
  return readErc20Decimals(chainId, assetAddress, context, event, pinToEvent);
}

/**
 * Resolves decimals for `(tokenAddress, chain)` via indexed instance row or ERC-20 RPC.
 */
async function resolveFromTokenAddress(
  context: Context,
  event: Event,
  chainId: number,
  centrifugeId: string,
  tokenAddress: `0x${string}`,
  pinToEvent?: boolean
): Promise<number | undefined> {
  const instance = (await TokenInstanceService.get(context, {
    address: tokenAddress,
    centrifugeId,
  })) as InstanceType<typeof TokenInstanceService> | null;
  if (instance) {
    const { decimals } = instance.read();
    if (typeof decimals === "number") return decimals;
  }
  return readErc20Decimals(chainId, tokenAddress, context, event, pinToEvent);
}

/** Injectable readers for share-class decimal resolution (parity tests). */
export type TokenIdDecimalsDeps = {
  getTokenDecimalsFromDb: (tokenId: `0x${string}`) => Promise<number | undefined>;
  getInstanceDecimalsFromDb: (
    tokenId: `0x${string}`,
    centrifugeId: string
  ) => Promise<number | undefined>;
  resolvePoolCurrencyDecimals: (poolId: bigint) => Promise<number | undefined>;
  readErc20Decimals: (
    chainId: number,
    tokenAddress: `0x${string}`,
    pinToEvent?: boolean
  ) => Promise<number | undefined>;
};

/**
 * Share-class decimal ladder: instance DB → token DB → pool currency → ERC-20 RPC.
 * @param eventChainId - `context.chain.id` from the calling handler
 * @param tokenId - Share class id (scId)
 * @param centrifugeId - Instance chain centrifuge id
 * @param keys - Pool and share token address hints
 * @param deps - DB and RPC readers
 */
export async function resolveTokenIdDecimalsLadder(
  eventChainId: number,
  tokenId: `0x${string}`,
  centrifugeId: string,
  keys: Pick<DecimalsResolverQuery, "poolId" | "tokenAddress" | "pinToEvent">,
  deps: TokenIdDecimalsDeps
): Promise<number | undefined> {
  const fromInstance = await deps.getInstanceDecimalsFromDb(tokenId, centrifugeId);
  if (typeof fromInstance === "number") return fromInstance;

  const fromToken = await deps.getTokenDecimalsFromDb(tokenId);
  if (typeof fromToken === "number") return fromToken;

  if (keys.poolId != null) {
    const fromPool = await deps.resolvePoolCurrencyDecimals(keys.poolId);
    if (typeof fromPool === "number") return fromPool;
  }

  if (keys.tokenAddress) {
    const fromErc20 = await deps.readErc20Decimals(
      eventChainId,
      keys.tokenAddress,
      keys.pinToEvent
    );
    if (typeof fromErc20 === "number") return fromErc20;
  }

  return undefined;
}

/**
 * Resolves decimals for a share class `tokenId` (instance → token → pool currency → ERC-20).
 */
async function resolveFromTokenId(
  context: Context,
  event: Event,
  chainId: number,
  centrifugeId: string,
  tokenId: `0x${string}`,
  query: DecimalsResolverQuery
): Promise<number | undefined> {
  const instance = (await TokenInstanceService.get(context, {
    tokenId,
    centrifugeId,
  })) as InstanceType<typeof TokenInstanceService> | null;

  const fromLadder = await resolveTokenIdDecimalsLadder(
    chainId,
    tokenId,
    centrifugeId,
    query,
    {
      getInstanceDecimalsFromDb: async (id, cid) => {
        const row = (await TokenInstanceService.get(context, {
          tokenId: id,
          centrifugeId: cid,
        })) as InstanceType<typeof TokenInstanceService> | null;
        if (!row) return undefined;
        const { decimals } = row.read();
        return typeof decimals === "number" ? decimals : undefined;
      },
      getTokenDecimalsFromDb: async (id) => {
        const token = (await TokenService.get(context, { id })) as InstanceType<
          typeof TokenService
        > | null;
        if (!token) return undefined;
        const { decimals } = token.read();
        return typeof decimals === "number" ? decimals : undefined;
      },
      resolvePoolCurrencyDecimals: async (poolId) => {
        const pool = (await PoolService.get(context, { id: poolId })) as InstanceType<
          typeof PoolService
        > | null;
        if (!pool) return undefined;
        return PoolService.resolveShareClassDecimalsForInit(context, event, pool);
      },
      readErc20Decimals: (_chainId, address, pinToEvent) =>
        readErc20Decimals(chainId, address, context, event, pinToEvent),
    }
  );
  if (typeof fromLadder === "number") return fromLadder;

  const { address } = instance?.read() ?? {};
  if (address) {
    return readErc20Decimals(chainId, address, context, event, query.pinToEvent);
  }

  return undefined;
}

/**
 * Resolves decimals at entity init only (DB → derived DB → RPC last).
 *
 * Tries, in order: `assetId` → `tokenId` → `(assetAddress, chain)` → `(tokenAddress, chain)`.
 * @param context - Ponder context
 * @param event - Handler event (RPC routing and optional event-pinned reads)
 * @param query - Any of tokenId, tokenAddress+chainId, assetId, assetAddress+chainId
 */
export async function resolveDecimalsForInit(
  context: Context,
  event: Event,
  query: DecimalsResolverQuery
): Promise<number | undefined> {
  const { chainId, centrifugeId } = await resolveChainContext(context, query);
  serviceLog("resolveDecimalsForInit", { ...query, chainId, centrifugeId });

  if (query.assetId != null) {
    const fromAssetId = await resolveFromAssetId(context, event, chainId, query.assetId, query);
    if (typeof fromAssetId === "number") return fromAssetId;
  }

  if (query.tokenId) {
    const fromTokenId = await resolveFromTokenId(
      context,
      event,
      chainId,
      centrifugeId,
      query.tokenId,
      query
    );
    if (typeof fromTokenId === "number") return fromTokenId;
  }

  if (query.assetAddress) {
    const fromAssetAddress = await resolveFromAssetAddress(
      context,
      event,
      chainId,
      centrifugeId,
      query.assetAddress,
      query.assetTokenId ?? ERC20_ASSET_TOKEN_ID,
      query.pinToEvent
    );
    if (typeof fromAssetAddress === "number") return fromAssetAddress;
  }

  if (query.tokenAddress) {
    return resolveFromTokenAddress(
      context,
      event,
      chainId,
      centrifugeId,
      query.tokenAddress,
      query.pinToEvent
    );
  }

  return undefined;
}
