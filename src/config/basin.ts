import type { Context } from "ponder:registry";
import { isChainEnabled, RegistryChains } from "../chains";
import { BlockchainService } from "../services/BlockchainService";

/**
 * GroveBasin instant JTRSY → USDC on Ethereum (Anemoy Treasury Fund).
 * Hub: Ethereum; indexing scope = GroveBasin + USDC async vault on the same chain.
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

/**
 * GroveBasin Sepolia testnet (demo pool `281474976720670` / share class `0x000100000000271e…`).
 * USDS + PSM are emulated; JTRSY, USDC, and the Centrifuge vault are real on Sepolia.
 */
export const BASIN_TESTNET_STATIC = {
  chainId: 11155111,
  startBlock: 10946251,
  basinAddress: "0x8c607f0af09141811e9f0c8b6110052663315ce4",
  poolId: 281474976720670n,
  tokenId: "0x000100000000271e0000000000000001",
  creditToken: "0xa90d0e4880af7af5f82c57d08fc88bb2e84154b0",
  collateralToken: "0x3aaaa86458d576bafcb1b7ed290434f0696da65c",
  swapToken: "0x5b38251c8ac2e33aef3363a0693284dc6ba1d2ad",
  ethereumUsdcVault: "0x3e14f2fbb5e0de284598b08b04cf1e4f6fbf40f7",
  creditTokenRateProvider: "0x0bfea47ec4075a5539c47630c9b52c508bbc6d70",
  collateralTokenRateProvider: "0xf1a4e30cfb772125195f1f70d6c917afce9fe822",
  swapTokenRateProvider: "0xf1a4e30cfb772125195f1f70d6c917afce9fe822",
  assetId: 5192296858534827628530496329220097n,
  tokenRedeemer: "0x077c99285d5cb503fcfef6facc7e7b5648fd27586",
} as const;

/** Basin static config keyed by EVM chain id (Ethereum mainnet + Sepolia). */
export const BASIN_STATIC_BY_CHAIN_ID = {
  [BASIN_MAINNET_STATIC.chainId]: BASIN_MAINNET_STATIC,
  [BASIN_TESTNET_STATIC.chainId]: BASIN_TESTNET_STATIC,
} as const;

export type BasinStaticConfig = typeof BASIN_MAINNET_STATIC | typeof BASIN_TESTNET_STATIC;

/** Resolved basin config: static fields plus registry `centrifugeId` for the chain. */
export type BasinConfig = BasinStaticConfig & { centrifugeId: string };

/**
 * Returns basin config when the handler chain has a static basin deployment and that chain is indexed.
 *
 * @param context - Ponder handler context (uses `context.chain.id` for chain gate and centrifuge id)
 * @returns Config with `centrifugeId`, or `null` when chain has no basin config or is excluded
 */
export function loadBasinConfig(context: Context): BasinConfig | null {
  const chainId = context.chain!.id;
  const staticConfig = BASIN_STATIC_BY_CHAIN_ID[chainId as keyof typeof BASIN_STATIC_BY_CHAIN_ID];
  if (!staticConfig) return null;
  if (!isChainEnabled(chainId)) return null;
  const centrifugeId = BlockchainService.getCentrifugeIdFromChainId(chainId);
  if (!centrifugeId) return null;
  return { ...staticConfig, centrifugeId };
}

/**
 * Ponder `groveBasin` chain map: `ethereum` network name for mainnet (`1`) or Sepolia (`11155111`).
 * Uses {@link RegistryChains} (post-`SELECTED_NETWORKS` filter). Mainnet wins if both are present.
 *
 * @returns `ethereum` entry when that chain is loaded from the registry, else `{}`
 */
export function getGroveBasinPonderChain(): Partial<
  Record<"ethereum", { address: `0x${string}`; startBlock: number }>
> {
  if (RegistryChains.some((c) => Number(c.network.chainId) === BASIN_MAINNET_STATIC.chainId)) {
    return {
      ethereum: {
        address: BASIN_MAINNET_STATIC.basinAddress,
        startBlock: BASIN_MAINNET_STATIC.startBlock,
      },
    };
  }
  if (RegistryChains.some((c) => Number(c.network.chainId) === BASIN_TESTNET_STATIC.chainId)) {
    return {
      ethereum: {
        address: BASIN_TESTNET_STATIC.basinAddress,
        startBlock: BASIN_TESTNET_STATIC.startBlock,
      },
    };
  }
  return {};
}

/** Whether GroveBasin log indexing is configured for this deployment. */
export const isGroveBasinIndexingConfigured = Object.keys(getGroveBasinPonderChain()).length > 0;
