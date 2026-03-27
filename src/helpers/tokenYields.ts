/**
 * Token yield **pure math**, snapshot column naming, and snapshot-history helpers (no DB).
 * Period specs: {@link ../config/tokenYield.ts}; bigint / Ray: {@link ./bigintMath.ts}.
 */

import { TOKEN_YIELD_SPECS, tokenYieldFieldName } from "../config/tokenYield";
import {
  PG_NUMERIC_78_MAX_ABS,
  RAY,
  RAY_TAIL,
  YIELD_MS_PER_DAY,
} from "./bigintMath";
import { compoundAnnualizedRayFromPrices } from "./tokenYieldCompound";
import { serviceError } from "./logger";

/**
 * Trailing-twelve-month lookback in UTC calendar days: `yieldTtm` uses price at or before `asOf - N days`.
 * (Spec entries with `dayCount` `360`/`365` are annualized; `dayCount` `null` is `yieldNd` simple total return.)
 */
export const YIELD_TTM_LOOKBACK_DAYS = 365;

/**
 * Fixed snapshot columns: **simple total return** in Ray (same as `simpleTotalReturnRay`), not annualized.
 * From {@link TOKEN_YIELD_SPECS}: names ending in `360`/`365` are annualized; plain `yieldNd` (no suffix) are simple total return.
 */
export const FIXED_TOKEN_YIELD_COLUMNS = ["yieldTtm", "yieldSinceInception", "yieldYtd"] as const;

export type FixedTokenYieldColumn = (typeof FIXED_TOKEN_YIELD_COLUMNS)[number];

export const CONFIGURED_TOKEN_YIELD_COLUMN_NAMES = TOKEN_YIELD_SPECS.map((s) =>
  tokenYieldFieldName(s)
) as readonly string[];

export const ALL_TOKEN_YIELD_SNAPSHOT_COLUMN_NAMES = [
  ...CONFIGURED_TOKEN_YIELD_COLUMN_NAMES,
  ...FIXED_TOKEN_YIELD_COLUMNS,
] as const;

export type TokenYieldSnapshotColumnName = (typeof ALL_TOKEN_YIELD_SNAPSHOT_COLUMN_NAMES)[number];

export type TokenYieldSnapshotFields = Partial<Record<TokenYieldSnapshotColumnName, bigint | null>>;

/** All configured + fixed yield keys initialized to `null`. */
export function emptyTokenYieldSnapshotFields(): Record<string, bigint | null> {
  const o: Record<string, bigint | null> = {};
  for (const spec of TOKEN_YIELD_SPECS) {
    o[tokenYieldFieldName(spec)] = null;
  }
  for (const k of FIXED_TOKEN_YIELD_COLUMNS) {
    o[k] = null;
  }
  return o;
}

/** One observation from `token_snapshot` for yield history. */
export type TokenSnapshotPricePoint = {
  timestamp: Date;
  tokenPrice: bigint | null;
  blockNumber: number;
};

/** Whole UTC calendar days between `from` (inclusive) and `to` (inclusive span floor). */
export function daysUtcFloor(from: Date, to: Date): number {
  if (to.getTime() < from.getTime()) return 0;
  return Math.floor((to.getTime() - from.getTime()) / YIELD_MS_PER_DAY);
}

/** Dedup key aligned with {@link sortTokenYieldPricePoints} (timestamp, then block). */
export function yieldSnapshotPointKey(p: TokenSnapshotPricePoint): string {
  return `${p.timestamp.getTime()}\0${p.blockNumber}`;
}

/**
 * Distinct UTC caps where yield math needs “latest strictly positive `tokenPrice` at or before T”
 * (see {@link priceAtOrBeforePositivePrice}), plus YTD start.
 */
export function yieldSnapshotCapTimes(asOf: Date): Date[] {
  const periodDays = new Set(TOKEN_YIELD_SPECS.map((spec) => spec.periodDays));
  const caps: Date[] = [...periodDays].map(
    (d) => new Date(asOf.getTime() - d * YIELD_MS_PER_DAY)
  );
  caps.push(new Date(asOf.getTime() - YIELD_TTM_LOOKBACK_DAYS * YIELD_MS_PER_DAY));
  caps.push(new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1)));
  return [...new Map(caps.map((d) => [d.getTime(), d])).values()];
}

/** Stable ascending order for snapshot history. */
export function sortTokenYieldPricePoints(points: TokenSnapshotPricePoint[]): TokenSnapshotPricePoint[] {
  return [...points].sort((a, b) => {
    const td = a.timestamp.getTime() - b.timestamp.getTime();
    if (td !== 0) return td;
    return a.blockNumber - b.blockNumber;
  });
}

/** Last strictly positive `tokenPrice` at or before `when` (points sorted ascending). */
export function priceAtOrBeforePositivePrice(
  pointsAsc: TokenSnapshotPricePoint[],
  when: Date
): bigint | null {
  let best: bigint | null = null;
  const wt = when.getTime();
  for (const p of pointsAsc) {
    if (p.timestamp.getTime() > wt) break;
    if (p.tokenPrice !== null && p.tokenPrice > 0n) best = p.tokenPrice;
  }
  return best;
}

/** Earliest strictly positive `tokenPrice` in history (same units as live `tokenPrice`). */
export function firstPositiveTokenYieldPricePoint(
  pointsAsc: TokenSnapshotPricePoint[]
): { price: bigint; at: Date } | null {
  for (const p of pointsAsc) {
    if (p.tokenPrice !== null && p.tokenPrice > 0n) {
      return { price: p.tokenPrice, at: p.timestamp };
    }
  }
  return null;
}

/**
 * Linear annualized return in Ray: `(P_end - P_start) / P_start * (dayCount / actualDays)`.
 * All multiplications first, one final `/` (truncates toward zero, same as Solidity signed div).
 */
export function simpleAnnualizedYieldRay(
  P_start: bigint,
  P_end: bigint,
  actualDays: number,
  dayCount: number
): bigint | null {
  if (P_start <= 0n || P_end <= 0n || actualDays < 1) return null;
  const delta = P_end - P_start;
  const d = BigInt(actualDays);
  const n = BigInt(dayCount);
  const den = P_start * d;
  if (den === 0n) return null;
  const num = delta * RAY * n;
  return num / den;
}

/**
 * Simple (non-annualized) return in Ray: `(P_end - P_start) / P_start`, i.e. `delta * RAY / P_start`
 * (truncates toward zero, same style as {@link simpleAnnualizedYieldRay} without a day-count factor).
 */
export function simpleTotalReturnRay(P_start: bigint, P_end: bigint): bigint | null {
  if (P_start <= 0n || P_end <= 0n) return null;
  const delta = P_end - P_start;
  return (delta * RAY) / P_start;
}

/** CAGR-style annualized return in Ray; fixed-point `ln`/`exp` via {@link compoundAnnualizedRayFromPrices}. */
export function compoundAnnualizedYieldRay(
  P_start: bigint,
  P_end: bigint,
  actualDays: number,
  dayCount: number
): bigint | null {
  return compoundAnnualizedRayFromPrices(P_start, P_end, actualDays, dayCount);
}

/**
 * Fills all snapshot yield keys (Ray or `null`).
 * **Annualized** (simple or compound): spec keys whose names end with `360` or `365` (e.g. `yield7d365`, `yield30dComp360`).
 * **Simple total return** (`simpleTotalReturnRay`): `yieldNd` with no day-count suffix, plus `yieldTtm`, `yieldYtd`, `yieldSinceInception`.
 * `yieldSinceInception` uses the **earliest strictly positive** `tokenPrice` in snapshot history as `P_start`.
 */
export function computeTokenYieldSnapshotFields(
  liveTokenPrice: bigint | null,
  asOf: Date,
  pointsAsc: TokenSnapshotPricePoint[]
): Record<string, bigint | null> {
  const fields = emptyTokenYieldSnapshotFields();
  const P_end = liveTokenPrice;
  if (P_end === null || P_end <= 0n) {
    return fields;
  }

  for (const spec of TOKEN_YIELD_SPECS) {
    const name = tokenYieldFieldName(spec);
    const windowStart = new Date(asOf.getTime() - spec.periodDays * YIELD_MS_PER_DAY);
    const P_start = priceAtOrBeforePositivePrice(pointsAsc, windowStart);
    const d = daysUtcFloor(windowStart, asOf);
    if (P_start === null || d < 1) {
      fields[name] = null;
      continue;
    }
    if (spec.dayCount === null) {
      fields[name] = spec.compounded ? null : simpleTotalReturnRay(P_start, P_end);
      continue;
    }
    fields[name] = spec.compounded
      ? compoundAnnualizedYieldRay(P_start, P_end, d, spec.dayCount)
      : simpleAnnualizedYieldRay(P_start, P_end, d, spec.dayCount);
  }

  const ttmStart = new Date(asOf.getTime() - YIELD_TTM_LOOKBACK_DAYS * YIELD_MS_PER_DAY);
  const P_ttm_start = priceAtOrBeforePositivePrice(pointsAsc, ttmStart);
  fields.yieldTtm =
    P_ttm_start === null ? null : simpleTotalReturnRay(P_ttm_start, P_end);

  const yStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));
  const P_ytd_start = priceAtOrBeforePositivePrice(pointsAsc, yStart);
  fields.yieldYtd =
    P_ytd_start === null ? null : simpleTotalReturnRay(P_ytd_start, P_end);

  const inception = firstPositiveTokenYieldPricePoint(pointsAsc);
  if (inception === null) {
    fields.yieldSinceInception = null;
  } else {
    fields.yieldSinceInception =
      inception.at.getTime() >= asOf.getTime()
        ? null
        : simpleTotalReturnRay(inception.price, P_end);
  }

  return fields;
}

/** Returns `null` if the Ray rate cannot be stored in `numeric(78)`. */
export function clampYieldRayForPg(ray: bigint | null): bigint | null {
  if (ray === null) return null;
  if (ray > PG_NUMERIC_78_MAX_ABS || ray < -PG_NUMERIC_78_MAX_ABS) {
    serviceError("tokenYield: Ray rate exceeds numeric(78) range", { ray });
    return null;
  }
  return ray;
}

/** Clamps every yield column so snapshot inserts never overflow `numeric(78)`. */
export function sanitizeTokenYieldSnapshotFields(
  fields: Record<string, bigint | null>
): Record<string, bigint | null> {
  const out: Record<string, bigint | null> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = clampYieldRayForPg(v);
  }
  return out;
}

/**
 * Converts a finite decimal annualized rate (e.g. `0.05` → 5%) to signed Ray.
 * Avoids `Number(RAY)` (10^27 is not exactly representable in IEEE-754): rounds `|rate| * 10^18` in float,
 * then multiplies by `10^9` in `bigint` to reach 27 decimals.
 */
export function toRay(rate: number): bigint | null {
  if (!Number.isFinite(rate)) return null;
  if (rate === 0) return 0n;
  const sign = rate < 0 ? -1n : 1n;
  const abs = Math.abs(rate);
  const scaled18 = abs * 1e18;
  if (!Number.isFinite(scaled18) || scaled18 > Number.MAX_SAFE_INTEGER) return null;
  const q = BigInt(Math.round(scaled18));
  return sign * (q * RAY_TAIL);
}

/**
 * Approximate `ray / RAY` as a JS number. Integer part is exact when `|ray / RAY| < 2^53`;
 * fractional part uses `fraction * 1e-27` (still approximate for huge fractions).
 */
export function fromRay(ray: bigint): number {
  if (ray === 0n) return 0;
  const sign = ray < 0n ? -1 : 1;
  const x = ray < 0n ? -ray : ray;
  const whole = x / RAY;
  const frac = x % RAY;
  return sign * (Number(whole) + Number(frac) * 1e-27);
}
