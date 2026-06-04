import { Context } from "ponder:registry";
import { Asset } from "ponder:schema";
import { serviceLog, serviceWarn } from "../helpers/logger";
import { Service, type ReadOnlyContext } from "./Service";

/** ERC-6909 token id used for vault-indexed assets; vaults support ERC-20 only (`tokenId = 0`). */
export const VAULT_ERC20_ASSET_TOKEN_ID = 0n;

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
   * Get the decimals of an asset.
   * @param context - The context.
   * @param assetId - The id of the asset.
   * @returns The decimals of the asset.
   */
  static async getDecimals(context: Context, assetId: bigint) {
    serviceLog(`Asset getDecimals assetId=${assetId}`);
    if (assetId < 1000n) return 18;
    const asset = (await this.get(context, {
      id: assetId,
    })) as AssetService;
    if (!asset) return undefined;
    const { decimals } = asset.read();
    return decimals;
  }

  /**
   * Resolves the ERC-20 asset for a vault deploy or sync-manager event (`assetTokenId = 0`).
   *
   * Vault indexing does not support ERC-6909 multi-token assets yet; event `tokenId` fields on
   * `DeployVault` / `SetMaxReserve` are ignored in favour of {@link VAULT_ERC20_ASSET_TOKEN_ID}.
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

/**
 * Decodes the centrifuge chain ID from an AssetId (high 16 bits of the uint128).
 * Matches the protocol's AssetId.sol centrifugeId(AssetId) logic.
 * @param assetId - The raw AssetId as bigint (uint128).
 * @returns The centrifugeId as string, or null for zero assetId.
 */
export function centrifugeIdFromAssetId(assetId: bigint): string | null {
  if (assetId === 0n) return null;
  const centrifugeId = Number((assetId >> 112n) & 0xffffn);
  return String(centrifugeId);
}
