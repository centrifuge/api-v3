/**
 * Token snapshot yields (Ray), history helpers. Config: {@link ../config/tokenYield.ts}.
 */

import BN from "bn.js";
import { TOKEN_YIELD_SPECS, tokenYieldFieldName } from "../config/tokenYield";
import { PG_NUMERIC_78_MAX_ABS, RAY, RAY_TAIL, WAD, YIELD_MS_PER_DAY } from "./bigintMath";
import { serviceError } from "./logger";

/** Lookback calendar days for `yieldTtm`. */
export const YIELD_TTM_LOOKBACK_DAYS = 365;

/** Fixed snapshot columns (simple total return, Ray). */
export const FIXED_TOKEN_YIELD_COLUMNS = ["yieldTtm", "yieldSinceInception", "yieldYtd"] as const;

const CONFIGURED_TOKEN_YIELD_COLUMN_NAMES = TOKEN_YIELD_SPECS.map((s) =>
  tokenYieldFieldName(s)
) as readonly string[];

/** All yield column names on `token_snapshot` (configured + fixed). */
export const ALL_TOKEN_YIELD_SNAPSHOT_COLUMN_NAMES = [
  ...CONFIGURED_TOKEN_YIELD_COLUMN_NAMES,
  ...FIXED_TOKEN_YIELD_COLUMNS,
] as const;

type TokenYieldSnapshotColumnName = (typeof ALL_TOKEN_YIELD_SNAPSHOT_COLUMN_NAMES)[number];

/** Partial row of yield bigint columns. */
export type TokenYieldSnapshotFields = Partial<Record<TokenYieldSnapshotColumnName, bigint | null>>;

/** All yield keys set to null. */
function emptyTokenYieldSnapshotFields(): Record<string, bigint | null> {
  const o: Record<string, bigint | null> = {};
  for (const spec of TOKEN_YIELD_SPECS) {
    o[tokenYieldFieldName(spec)] = null;
  }
  for (const k of FIXED_TOKEN_YIELD_COLUMNS) {
    o[k] = null;
  }
  return o;
}

/** Snapshot row fields used when building yield price history. */
export type TokenSnapshotPricePoint = {
  timestamp: Date;
  tokenPrice: bigint | null;
  blockNumber: number;
};

/** Floor of UTC calendar days between `from` and `to`. */
function daysUtcFloor(from: Date, to: Date): number {
  if (to.getTime() < from.getTime()) return 0;
  return Math.floor((to.getTime() - from.getTime()) / YIELD_MS_PER_DAY);
}

/** Dedup key: timestamp + block (see {@link sortTokenYieldPricePoints}). */
export function yieldSnapshotPointKey(p: TokenSnapshotPricePoint): string {
  return `${p.timestamp.getTime()}\0${p.blockNumber}`;
}

/** Distinct “cap” times for bounded history fetch (windows, TTM, Jan 1). */
export function yieldSnapshotCapTimes(asOf: Date): Date[] {
  const periodDays = new Set(TOKEN_YIELD_SPECS.map((spec) => spec.periodDays));
  const caps: Date[] = [...periodDays].map(
    (d) => new Date(asOf.getTime() - d * YIELD_MS_PER_DAY)
  );
  caps.push(new Date(asOf.getTime() - YIELD_TTM_LOOKBACK_DAYS * YIELD_MS_PER_DAY));
  caps.push(new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1)));
  return [...new Map(caps.map((d) => [d.getTime(), d])).values()];
}

/** Sort by `timestamp` then `blockNumber` ascending. */
export function sortTokenYieldPricePoints(points: TokenSnapshotPricePoint[]): TokenSnapshotPricePoint[] {
  return [...points].sort((a, b) => {
    const td = a.timestamp.getTime() - b.timestamp.getTime();
    if (td !== 0) return td;
    return a.blockNumber - b.blockNumber;
  });
}

/** Last strictly positive `tokenPrice` at or before `when` (`pointsAsc` sorted). */
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

/** First strictly positive `tokenPrice` in ascending `pointsAsc`. */
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

/** Simple annualized return in Ray. */
function simpleAnnualizedYieldRay(
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

/** Simple total return `(P_end - P_start) / P_start` in Ray. */
function simpleTotalReturnRay(P_start: bigint, P_end: bigint): bigint | null {
  if (P_start <= 0n || P_end <= 0n) return null;
  const delta = P_end - P_start;
  return (delta * RAY) / P_start;
}

const COMPOUND_SCALE = 54;
const COMPOUND_ONE = new BN(10).pow(new BN(COMPOUND_SCALE));
const LN2 = new BN("693147180559945309417232121458176568075500134360255254");
const WAD_BN = new BN(WAD.toString());
const RAY_TAIL_BN = new BN(RAY_TAIL.toString());
const MAX_EXP_ABS = COMPOUND_ONE.muln(48);
const LN_ITER = 160;
const EXP_ITER = 256;

/** ln(R) with R = P_end/P_start scaled to COMPOUND_ONE (bn.js). */
function lnRatioFromScaledR(R: BN): BN {
  const W = COMPOUND_ONE;
  const twoW = W.add(W);
  let x = R.clone();
  let k = 0;

  while (x.cmp(twoW) >= 0) {
    x = x.shrn(1);
    k += 1;
  }
  while (x.cmp(W) < 0) {
    x = x.add(x);
    k -= 1;
  }

  const uNum = x.sub(W);
  const uDen = x.add(W);
  let t = uNum.mul(COMPOUND_ONE).div(uDen);
  let acc = new BN(0);

  for (let i = 0; i < LN_ITER; i++) {
    const coef = 2 * i + 1;
    acc = acc.add(t.divn(coef));
    const tNext = t.mul(uNum).div(uDen).mul(uNum).div(uDen);
    if (tNext.isZero()) break;
    t = tNext;
  }

  const lnY = acc.add(acc);
  return lnY.add(LN2.mul(new BN(k)));
}

/** exp(E/COMPOUND_ONE) * COMPOUND_ONE; truncated series. */
function expScaled(E: BN): BN | null {
  if (E.abs().cmp(MAX_EXP_ABS) > 0) return null;

  if (E.isNeg()) {
    const pos = expScaled(E.neg());
    if (pos === null) return null;
    if (pos.isZero()) return new BN(0);
    return COMPOUND_ONE.mul(COMPOUND_ONE).div(pos);
  }

  let term = new BN(COMPOUND_ONE);
  let sum = new BN(COMPOUND_ONE);
  for (let k = 1; k < EXP_ITER; k++) {
    term = term.mul(E).div(COMPOUND_ONE);
    if (term.isZero()) break;
    term = term.divn(k);
    sum = sum.add(term);
    if (sum.bitLength() > 8000) return null;
  }
  return sum;
}

/** Compound annualized: (P_end/P_start)^(dayCount/actualDays) − 1 in Ray. */
function compoundAnnualizedRayFromPrices(
  P_start: bigint,
  P_end: bigint,
  actualDays: number,
  dayCount: number
): bigint | null {
  if (P_start <= 0n || P_end <= 0n || actualDays < 1) return null;

  const p0 = new BN(P_start.toString(10));
  const p1 = new BN(P_end.toString(10));
  const R = p1.mul(COMPOUND_ONE).div(p0);
  if (R.isZero()) return null;

  const lnR = lnRatioFromScaledR(R);
  const E = lnR.muln(dayCount).divn(actualDays);

  const growthScaled = expScaled(E);
  if (growthScaled === null) return null;

  const growthWad = growthScaled.mul(WAD_BN).div(COMPOUND_ONE);
  const annualWad = growthWad.sub(WAD_BN);
  const ray = annualWad.mul(RAY_TAIL_BN);

  try {
    return BigInt(ray.toString(10));
  } catch {
    return null;
  }
}

/**
 * All `token_snapshot` yield fields for end price `liveTokenPrice` at `asOf`.
 * Names ending in 360/365: annualized; `yieldNd` (no suffix), TTM/YTD/since inception: simple total return.
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
      ? compoundAnnualizedRayFromPrices(P_start, P_end, d, spec.dayCount)
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

/** null if |ray| exceeds Postgres numeric(78). */
export function clampYieldRayForPg(ray: bigint | null): bigint | null {
  if (ray === null) return null;
  if (ray > PG_NUMERIC_78_MAX_ABS || ray < -PG_NUMERIC_78_MAX_ABS) {
    serviceError("tokenYield: Ray rate exceeds numeric(78) range", { ray });
    return null;
  }
  return ray;
}

/** Clamp each value with {@link clampYieldRayForPg}. */
export function sanitizeTokenYieldSnapshotFields(
  fields: Record<string, bigint | null>
): Record<string, bigint | null> {
  const out: Record<string, bigint | null> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = clampYieldRayForPg(v);
  }
  return out;
}
