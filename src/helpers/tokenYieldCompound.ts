import BN from "bn.js";
import { RAY_TAIL, WAD } from "./bigintMath";

/**
 * CAGR-style annualized return as **signed Ray** via fixed-point `ln`/`exp` (no `Math.pow`).
 * `ratio = P_end/P_start`, `growth = ratio^(dayCount/actualDays)`, `annual = growth - 1`, stored as `annual * RAY`.
 *
 * Uses {@link https://github.com/indutny/bn.js bn.js} for intermediate mul/div; core recurrence matches
 * `ln(x)=ln(y)+k·ln(2)` with `y∈[1,2)` and `ln(y)=2·Σ u^{2i+1}/(2i+1)`, `u=(y-1)/(y+1)`.
 */

const SCALE = 54;
const ONE = new BN(10).pow(new BN(SCALE));

/** ln(2) · 10^SCALE (truncated toward zero). */
const LN2 = new BN("693147180559945309417232121458176568075500134360255254");

const WAD_BN = new BN(WAD.toString());
const RAY_TAIL_BN = new BN(RAY_TAIL.toString());

/** Reject `exp` args whose magnitude would blow fixed-point iteration or DB range. */
const MAX_EXP_ABS = ONE.muln(48);

const LN_ITER = 160;
const EXP_ITER = 256;

function lnRatioFromScaledR(R: BN): BN {
  const W = ONE;
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
  let t = uNum.mul(ONE).div(uDen);
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

/**
 * `exp(E/ONE) · ONE`, truncated toward zero each step (same spirit as on-chain fixed math).
 * Negative `E` uses `exp(E)=ONE²/exp(-E)` so we never sum alternating truncated Taylor terms.
 */
function expScaled(E: BN): BN | null {
  if (E.abs().cmp(MAX_EXP_ABS) > 0) return null;

  if (E.isNeg()) {
    const pos = expScaled(E.neg());
    if (pos === null) return null;
    if (pos.isZero()) return new BN(0);
    return ONE.mul(ONE).div(pos);
  }

  let term = new BN(ONE);
  let sum = new BN(ONE);
  for (let k = 1; k < EXP_ITER; k++) {
    term = term.mul(E).div(ONE);
    if (term.isZero()) break;
    term = term.divn(k);
    sum = sum.add(term);
    if (sum.bitLength() > 8000) return null;
  }
  return sum;
}

/**
 * Annualized compound return in Ray: `(P_end/P_start)^(dayCount/actualDays) - 1` as `bigint`.
 */
export function compoundAnnualizedRayFromPrices(
  P_start: bigint,
  P_end: bigint,
  actualDays: number,
  dayCount: number
): bigint | null {
  if (P_start <= 0n || P_end <= 0n || actualDays < 1) return null;

  const p0 = new BN(P_start.toString(10));
  const p1 = new BN(P_end.toString(10));
  const R = p1.mul(ONE).div(p0);
  if (R.isZero()) return null;

  const lnR = lnRatioFromScaledR(R);
  const E = lnR.muln(dayCount).divn(actualDays);

  const growthScaled = expScaled(E);
  if (growthScaled === null) return null;

  const growthWad = growthScaled.mul(WAD_BN).div(ONE);
  const annualWad = growthWad.sub(WAD_BN);
  const ray = annualWad.mul(RAY_TAIL_BN);

  try {
    return BigInt(ray.toString(10));
  } catch {
    return null;
  }
}
