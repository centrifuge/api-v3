import { RAY } from "../helpers/bigintMath";
import { BASIN_MAINNET_STATIC, getSelectedBasinStatic } from "./basin";

/**
 * Sky protocol constants for CFGL debt tracking: the debt CFGL owes Grove compounds per
 * second at the Sky Savings Rate (sUSDS `ssr`) plus a fixed spread.
 */

/** sUSDS token on Ethereum mainnet (SSR rate source, `ssr()` + `File` events). */
export const SUSDS_MAINNET_ADDRESS = "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd" as const;

/** Fixed CFGL debt spread over SSR in basis points. */
export const DEBT_SPREAD_BPS = 30;

/**
 * Per-second compounding factor of the 30 bps annual spread, in Ray:
 * `(1.0030) ^ (1 / 31_536_000) * 1e27`, rounded to the nearest integer.
 * Effective per-second rate = `ssr * SPREAD_PER_SECOND_RAY / RAY` (per-second factors multiply).
 */
export const SPREAD_PER_SECOND_RAY = 1_000_000_000_094_986_966_639_419_900n;

/**
 * SSR fallback for chains without sUSDS (Sepolia): 1.0 in Ray, i.e. 0% SSR, so the
 * effective testnet rate is the 30 bps spread alone.
 */
export const FALLBACK_SSR_PER_SECOND_RAY = RAY;

/**
 * Ponder chain map for the sUSDS contract. Only present when the mainnet basin deployment
 * is selected; indexing starts at the basin start block (the initial SSR is read from the
 * contract when the debt row is first initialized, so no pre-basin rate history is needed).
 *
 * @returns `ethereum` entry for mainnet, else `{}`
 */
export function getSusdsPonderChain(): Partial<
  Record<"ethereum", { address: `0x${string}`; startBlock: number }>
> {
  const selected = getSelectedBasinStatic();
  if (!selected || selected.chainId !== BASIN_MAINNET_STATIC.chainId) return {};
  return {
    ethereum: {
      address: SUSDS_MAINNET_ADDRESS,
      startBlock: selected.startBlock,
    },
  };
}

/** Whether sUSDS SSR indexing is configured for this deployment. */
export const isSusdsIndexingConfigured = Object.keys(getSusdsPonderChain()).length > 0;

/**
 * sUSDS address for on-chain `ssr()` seeding reads on the given chain, or `null` when the
 * chain has no sUSDS deployment (use {@link FALLBACK_SSR_PER_SECOND_RAY} instead).
 *
 * @param chainId - EVM chain id of the handler context
 * @returns sUSDS address or `null`
 */
export function getSusdsAddress(chainId: number): `0x${string}` | null {
  return chainId === BASIN_MAINNET_STATIC.chainId ? SUSDS_MAINNET_ADDRESS : null;
}
