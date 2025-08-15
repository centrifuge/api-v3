import { AssetRegistration } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing AssetRegistration entities.
 * Extends the base Service class with AssetRegistration-specific functionality
 * and provides methods for setting status and asset Centrifuge ID.
 *
 * Inherits static methods from mixinCommonStatics:
 * - init(): Create new AssetRegistration
 * - get(): Find existing AssetRegistration by query
 * - getOrInit(): Find or create AssetRegistration
 * - query(): Query multiple AssetRegistration records
 */
export class AssetRegistrationService extends mixinCommonStatics(
  Service<typeof AssetRegistration>,
  AssetRegistration,
  "AssetRegistration"
) {}

/**
 * Extracts the Centrifuge ID from a 128-bit asset ID by performing a right shift operation.
 * The Centrifuge ID is stored in the upper 16 bits (bits 112-127) of the asset ID.
 *
 * @param assetId - The 128-bit asset ID as a bigint
 * @returns The Centrifuge ID as a string, or null if the ID is 0 (indicating no Centrifuge ID)
 *
 * @example
 * ```typescript
 * const assetId = 0x1234567890ABCDEF1234567890ABCDEFn;
 * const centrifugeId = getAssetCentrifugeId(assetId);
 * // Returns the Centrifuge ID from the upper 16 bits
 * ```
 */
export function getAssetCentrifugeId(assetId: bigint): string | null {
  // Perform the right shift by 112 bits
  const centrifugeId = assetId >> 112n;
  return centrifugeId === 0n ? null : centrifugeId.toString();
}
