import type { Context } from "ponder:registry";
import { isChainEnabled } from "../chains";
import { BlockchainService } from "../services/BlockchainService";

/**
 * GroveBasin instant JTRSY → USDC on Ethereum (Anemoy Treasury Fund).
 * Hub: Ethereum; indexing scope = GroveBasin + mainnet USDC async vault only.
 *
 * @see https://docs.centrifuge.io/developer/protocol/deployments/
 */

/** Static mainnet deployment constants for GroveBasin and Centrifuge join keys. */
export const BASIN_MAINNET_STATIC = {
  chainId: 1,
  startBlock: 25079122,
  basinAddress: "0x1fa4db8d545cbd22b7bba2084348a2e6ef36e363",
  poolId: 281474976710662n,
  tokenId: "0x00010000000000060000000000000001",
  creditToken: "0x8c213ee79581ff4984583c6a801e5263418c4b86",
  collateralToken: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  swapToken: "0xdc035d45d973e3ec169d2276ddab16f1e407384f",
  ethereumUsdcVault: "0xfe6920eb6c421f1179ca8c8d4170530cdbdfd77a",
  creditTokenRateProvider: "0x29209cecfefa6f675e6f1f829320d67ce2b025e5",
  collateralTokenRateProvider: "0x7928a185b8137d1cd2a0996a810a04db2837419d",
  swapTokenRateProvider: "0x7928a185b8137d1cd2a0996a810a04db2837419d",
  assetId: 242333941209166991950178742833476896417n,
  /** Update when contracts team publishes TokenRedeemer. */
  tokenRedeemer: "0x0000000000000000000000000000000000000000",
} as const;

/** Resolved basin config: static mainnet fields plus registry `centrifugeId` for the chain. */
export type BasinConfig = typeof BASIN_MAINNET_STATIC & { centrifugeId: string };

/**
 * Returns basin config when the handler is on Ethereum mainnet and that chain is indexed.
 *
 * @param context - Ponder handler context (uses `context.chain.id` for chain gate and centrifuge id)
 * @returns Config with `centrifugeId`, or `null` when not on chain 1 or mainnet is excluded
 */
export function loadBasinConfig(context: Context): BasinConfig | null {
  if (!isChainEnabled(BASIN_MAINNET_STATIC.chainId)) return null;
  if (context.chain!.id !== BASIN_MAINNET_STATIC.chainId) return null;
  const centrifugeId = BlockchainService.getCentrifugeIdFromChainId(context.chain!.id);
  if (!centrifugeId) return null;
  return { ...BASIN_MAINNET_STATIC, centrifugeId };
}
