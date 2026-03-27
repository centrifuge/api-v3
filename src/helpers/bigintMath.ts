/**
 * Shared **bigint** utilities and fixed-point **constants** used across the indexer.
 *
 * Yield-specific Ray/WAD bounds pair with period config in `src/config/tokenYield.ts`.
 */

/**
 * Returns the minimum value from a list of bigints.
 * @param values - The list of bigints to find the minimum value of.
 * @returns The minimum value from the list of bigints.
 */
export function bigintMin(...values: bigint[]) {
  return values.reduce((min, value) => (value < min ? value : min), values[0] ?? 0n);
}

/**
 * Returns the maximum value from a list of bigints.
 * @param values - The list of bigints to find the maximum value of.
 * @returns The maximum value from the list of bigints.
 */
export function bigintMax(...values: bigint[]) {
  return values.reduce((max, value) => (value > max ? value : max), values[0] ?? 0n);
}

// --- Token yield: calendar windows + Ray / WAD (see `src/config/tokenYield.ts`) ---

/** Milliseconds per calendar day (UTC day-count math in yield windows). */
export const YIELD_MS_PER_DAY = 86_400_000;

/** Ray decimals (Maker-style fixed-point for rates). */
export const RAY_DECIMALS = 27;

/** One unit of rate = 1.0 in Ray. */
export const RAY = 10n ** BigInt(RAY_DECIMALS);

/**
 * 10^18 scale for **dimensionless** price ratios in bigint before optional float conversion (`P_end / P_start`).
 * Matches common ERC-20 share/NAV decimals; ratio is still valid if both prices share the same decimals.
 * Also the high limb of Ray: `RAY = WAD * RAY_TAIL` (`10^18 * 10^9 = 10^27`).
 */
export const WAD = 10n ** 18n;

export const RAY_TAIL = 10n ** 9n;

if (WAD * RAY_TAIL !== RAY) {
  throw new Error("bigintMath: WAD * RAY_TAIL must equal RAY");
}

/**
 * Ponder stores `t.bigint()` as PostgreSQL `numeric(78)` (~78 decimal digits).
 * Yield math can exceed this when `P_start` is tiny; values outside range → unrepresentable.
 */
export const PG_NUMERIC_78_MAX_ABS = 10n ** 78n - 1n;
