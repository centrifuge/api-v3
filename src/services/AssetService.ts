import { Context, Event } from "ponder:registry";
import { Asset } from "ponder:schema";
import { serviceLog, serviceWarn } from "../helpers/logger";
import {
  resolveAssetDecimals,
  resolveHubChainId,
  readHubRegistryDecimalsAtTip,
  readSpokeAssetDecimalsAtTip,
  type AssetDecimalsKeys,
} from "../helpers/assetDecimals";
import { Service, type ReadOnlyContext } from "./Service";
import { BlockchainService } from "./BlockchainService";
import { PoolService } from "./PoolService";
import { TokenService } from "./TokenService";

/** ERC-6909 token id for vault-indexed assets; vaults support ERC-20 only (`tokenId = 0`). */
const VAULT_ERC20_ASSET_TOKEN_ID = 0n;

/** Re-export for handlers that decode asset home spoke from asset id. */
export { centrifugeIdFromAssetId } from "../helpers/assetDecimals";
export type { AssetDecimalsKeys };

/**
 * Service class for managing Asset entities in the database.
 *
 * Assets represent financial instruments within pools, including loans, cash positions,
 * and other investment vehicles. Each asset has properties like outstanding debt,
 * interest rates, maturity dates, and valuation methods.
 *
 * This service provides CRUD operations and database interaction utilities for Asset entities,
 * extending the abstract [`Service`](./Service.ts) base (standard entity statics).
 *
 * @example
 * ```typescript
 * // Create a new asset
 * const asset = await AssetService.init(context, {
 *   id: 123n,
 *   centrifugeId: "centrifuge:123",
 *   address: "0x...",
 *   name: "Loan #123",
 *   // ... other asset properties
 * });
 *
 * // Find an existing asset
 * const asset = await AssetService.get(context, { id: 123n });
 *
 * // Query multiple assets
 * const activeAssets = await AssetService.query(context, { isActive: true });
 * ```
 *
 * @extends {Service<typeof Asset>}
 * @see {@link Service} Base service class for common CRUD operations
 * @see {@link Asset} Asset entity schema definition
 */
export class AssetService extends Service<typeof Asset> {
  static readonly entityTable = Asset;
  static readonly entityName = "Asset";

  /**
   * Resolves asset decimals: ISO short-circuit, DB row, then revert-safe hub/spoke RPC at tip.
   * Read-only — never creates asset rows.
   * @param context - Database context
   * @param assetId - Protocol asset id
   * @param event - Handler event (chain id for hub RPC routing)
   * @param keys - Optional hub registry address or pool home hub centrifuge id
   */
  static async getDecimals(
    context: Context,
    assetId: bigint,
    _event: Event,
    keys?: AssetDecimalsKeys
  ): Promise<number | undefined> {
    serviceLog(`Asset getDecimals assetId=${assetId}`);
    const hubChainId = resolveHubChainId(
      context.chain.id,
      keys,
      BlockchainService.getChainIdFromCentrifugeId.bind(BlockchainService)
    );
    return resolveAssetDecimals(assetId, hubChainId, keys, {
      getAssetDecimalsFromDb: async (id) => {
        const asset = (await AssetService.get(context, { id })) as AssetService | null;
        if (!asset) return undefined;
        const { decimals: dbDecimals } = asset.read();
        return typeof dbDecimals === "number" ? dbDecimals : undefined;
      },
      readHubRegistryDecimals: (chainId, id, hubRegistryAddress) =>
        readHubRegistryDecimalsAtTip(chainId, id, hubRegistryAddress),
      readSpokeAssetDecimals: (id) => readSpokeAssetDecimalsAtTip(id),
    });
  }

  /**
   * Resolves decimal places for a pool currency: `pool.decimals` when set, else {@link getDecimals}.
   * @param context - Database context
   * @param pool - Indexed pool row
   * @param event - Handler event for RPC routing
   */
  static async resolvePoolCurrencyDecimals(
    context: Context,
    pool: PoolService,
    event: Event
  ): Promise<number | undefined> {
    const { decimals, currency, centrifugeId } = pool.read();
    if (typeof decimals === "number") return decimals;
    if (currency == null) return undefined;
    return AssetService.getDecimals(context, currency, event, { poolCentrifugeId: centrifugeId });
  }

  /**
   * Sets `pool.decimals` on pools whose currency matches a newly registered asset.
   * @param context - Database context
   * @param assetId - Pool currency asset id
   * @param decimals - Known decimals from the registration event
   * @param event - Handler event for update timestamps
   */
  static async backfillPoolDecimals(
    context: Context,
    assetId: bigint,
    decimals: number,
    event: Event
  ): Promise<void> {
    serviceLog(`Asset backfillPoolDecimals assetId=${assetId} decimals=${decimals}`);
    const pools = (await PoolService.query(context, {
      currency: assetId,
      decimals: null,
    })) as PoolService[];
    if (pools.length === 0) return;
    for (const pool of pools) {
      pool.setDecimals(decimals);
    }
    await PoolService.saveMany(context, pools, event);
    await TokenService.backfillTokenDecimals(context, assetId, decimals, event);
  }

  /**
   * Resolves the ERC-20 asset for a vault deploy or sync-manager event (`assetTokenId = 0`).
   *
   * Vault indexing does not support ERC-6909 multi-token assets yet; event `tokenId` fields on
   * `DeployVault` / `SetMaxReserve` are ignored in favour of `assetTokenId = 0`.
   *
   * @param context - Database context
   * @param query - Chain and vault asset contract address
   * @returns The registered ERC-20 asset row, or `null` when not registered
   */
  static async getByTokenForVault(
    context: Context | ReadOnlyContext,
    query: { centrifugeId: string; address: `0x${string}` }
  ): Promise<AssetService | null> {
    return AssetService.getByToken(context, {
      ...query,
      assetTokenId: VAULT_ERC20_ASSET_TOKEN_ID,
    });
  }

  /**
   * Loads an asset by protocol `assetId` from an indexed vault row (set at deploy via {@link getByTokenForVault}).
   *
   * @param context - Database context
   * @param assetId - The protocol-assigned asset id stored on the vault
   * @returns The asset row, or `null` when not registered
   */
  static async getForVault(
    context: Context | ReadOnlyContext,
    assetId: bigint
  ): Promise<AssetService | null> {
    serviceLog(`Asset getForVault assetId=${assetId}`);
    return (await AssetService.get(context, { id: assetId })) as AssetService | null;
  }

  /**
   * Resolves an asset by its full identity `(centrifugeId, address, assetTokenId)`.
   *
   * This is the correct lookup for ERC-6909 assets, where a single contract `address` holds many
   * tokens distinguished by `assetTokenId` (ERC-20 is the `assetTokenId = 0` case). Looking up by
   * `address` alone is ambiguous for ERC-6909 and must not be used to derive an `assetId`.
   *
   * If more than one asset matches — a duplicate on-chain registration assigning two `assetId`s to
   * the same token — this returns the **newest** row by `createdAtBlock` and logs a warning, rather
   * than failing, so indexing stays stable. The underlying duplicate must be resolved on-chain.
   *
   * @param context - Database context
   * @param query - The chain, contract address, and ERC-6909 token id
   * @returns The matching asset (newest registration if several), or `null` when none is registered
   */
  static async getByToken(
    context: Context | ReadOnlyContext,
    query: { centrifugeId: string; address: `0x${string}`; assetTokenId: bigint }
  ): Promise<AssetService | null> {
    serviceLog(
      `Asset getByToken centrifugeId=${query.centrifugeId} address=${query.address} assetTokenId=${query.assetTokenId}`
    );
    const assets = (await AssetService.query(context, {
      ...query,
      _sort: [{ field: "createdAtBlock", direction: "desc" }],
    })) as AssetService[];
    if (assets.length > 1) {
      serviceWarn(
        `Multiple assets registered for (centrifugeId=${query.centrifugeId}, ` +
          `address=${query.address}, assetTokenId=${query.assetTokenId}) ` +
          `[ids: ${assets.map((a) => a.read().id).join(", ")}] — using newest by createdAtBlock. ` +
          `Likely duplicate on-chain registration; resolve idempotency on-chain.`
      );
    }
    return assets[0] ?? null;
  }
}
