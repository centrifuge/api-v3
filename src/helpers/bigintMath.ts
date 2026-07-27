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

/** Seconds per (non-leap) year; matches Sky's per-second rate annualization. */
export const SECONDS_PER_YEAR = 31_536_000n;

/**
 * Rescales a token amount between decimal precisions (floor on downscale).
 *
 * @param amount - Amount in `fromDecimals` precision
 * @param fromDecimals - Source token decimals
 * @param toDecimals - Target decimals (defaults to 18)
 * @returns Amount in `toDecimals` precision
 */
export function scaleDecimals(amount: bigint, fromDecimals: number, toDecimals = 18): bigint {
  if (fromDecimals === toDecimals) return amount;
  if (fromDecimals < toDecimals) return amount * 10n ** BigInt(toDecimals - fromDecimals);
  return amount / 10n ** BigInt(fromDecimals - toDecimals);
}

/**
 * Fixed-point exponentiation by squaring: `(base / unit) ^ exp`, scaled by `unit`.
 * Same semantics as MakerDAO/Sky `rpow` (used for DSR/SSR compounding), including its
 * round-half-up per multiplication step, so accrual matches the on-chain convention.
 *
 * @param base - Fixed-point base (e.g. per-second rate in Ray)
 * @param exp - Integer exponent (e.g. elapsed seconds), must be >= 0
 * @param unit - Fixed-point scale of `base` (defaults to {@link RAY})
 * @returns `base ^ exp` in `unit` fixed-point
 */
export function rpow(base: bigint, exp: bigint, unit: bigint = RAY): bigint {
  if (exp < 0n) throw new Error(`rpow: negative exponent ${exp}`);
  const half = unit / 2n;
  let result = unit;
  let b = base;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b + half) / unit;
    e >>= 1n;
    if (e > 0n) b = (b * b + half) / unit;
  }
  return result;
}
