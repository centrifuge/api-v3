import { Context, Event } from "ponder:registry";
import { Asset } from "ponder:schema";
import { serviceLog, serviceWarn } from "../helpers/logger";
import { centrifugeIdFromAssetId } from "../helpers/decimalsResolver";
import { Service, type ReadOnlyContext } from "./Service";
import { PoolService } from "./PoolService";
import { TokenService } from "./TokenService";

/** ERC-6909 token id for vault-indexed assets; vaults support ERC-20 only (`tokenId = 0`). */
const VAULT_ERC20_ASSET_TOKEN_ID = 0n;

/** Re-export for handlers that decode asset home spoke from asset id. */
export { centrifugeIdFromAssetId };

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
 * @extends {Service<typeof Asset>}
 * @see {@link Service} Base service class for common CRUD operations
 * @see {@link Asset} Asset entity schema definition
 */
export class AssetService extends Service<typeof Asset> {
  static readonly entityTable = Asset;
  static readonly entityName = "Asset";

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
    })) as PoolService[];
    if (pools.length > 0) {
      for (const pool of pools) {
        pool.setDecimals(decimals);
      }
      await PoolService.saveMany(context, pools, event);
    }
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
