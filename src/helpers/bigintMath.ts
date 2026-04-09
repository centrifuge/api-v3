/** Shared bigint helpers and fixed-point constants. */

/** Maximum of the given bigints. */
export function bigintMax(...values: bigint[]) {
  return values.reduce((max, value) => (value > max ? value : max), values[0] ?? 0n);
}

/** ms per UTC calendar day (yield windows). */
export const YIELD_MS_PER_DAY = 86_400_000;

const RAY_DECIMALS = 27;

/** 1.0 rate in Ray (27 decimals). */
export const RAY = 10n ** BigInt(RAY_DECIMALS);

/** 18-decimal limb; `RAY = WAD * RAY_TAIL`. */
export const WAD = 10n ** 18n;

export const RAY_TAIL = 10n ** 9n;

if (WAD * RAY_TAIL !== RAY) {
  throw new Error("bigintMath: WAD * RAY_TAIL must equal RAY");
}

/** Absolute max safe for `numeric(78)` yield columns. */
export const PG_NUMERIC_78_MAX_ABS = 10n ** 78n - 1n;
