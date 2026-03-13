import { Context } from "ponder:registry";
import { Asset } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing Asset entities in the database.
 *
 * Assets represent financial instruments within pools, including loans, cash positions,
 * and other investment vehicles. Each asset has properties like outstanding debt,
 * interest rates, maturity dates, and valuation methods.
 *
 * This service provides CRUD operations and database interaction utilities for Asset entities,
 * inheriting common functionality from the base Service class and mixinCommonStatics.
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
export class AssetService extends mixinCommonStatics(Service<typeof Asset>, Asset, "Asset") {
  /**
   * Get the decimals of an asset.
   * @param context - The context.
   * @param assetId - The id of the asset.
   * @returns The decimals of the asset.
   */
  static async getDecimals(context: Context, assetId: bigint) {
    if (assetId < 1000n) return 18;
    const asset = (await this.get(context, {
      id: assetId,
    })) as AssetService;
    if (!asset) return undefined;
    const { decimals } = asset.read();
    return decimals;
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
