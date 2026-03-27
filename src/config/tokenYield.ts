/**
 * Hub-token yield **configuration**: periods, column names, and schema-related constants.
 *
 * **Units**
 * - `tokenPrice` / snapshot prices: raw on-chain integers; start and end of a window use the same unit
 *   (ratio is dimensionless). Do not mix hub vs spoke prices in one yield.
 * - Stored yields: **signed Ray** — see `RAY` / `WAD` in {@link ../helpers/bigintMath.ts}.
 *
 * **Implementation**
 * - Bigint / Ray / DB bounds: `src/helpers/bigintMath.ts`
 * - Snapshot yield columns / math / DB load orchestration: `src/helpers/tokenYields.ts`
 * - Compound `ln`/`exp` path: `src/helpers/tokenYieldCompound.ts`
 */

export type TokenYieldPeriodSpec = {
  readonly periodDays: number;
  readonly compounded: boolean;
  /** `null`: simple total return over the window, column `yield<days>d` (not annualized). */
  readonly dayCount: 360 | 365 | null;
};

/** Rolling window lengths (days) for rolling yield columns. */
export const PERIOD_DAYS_SIMPLE = [1, 7, 15, 30, 90, 180] as const;

/**
 * Paired with each rolling window: `null` → `yield7d`-style simple total return; `360`/`365` → annualized.
 */
export const DAY_COUNTS = [null, 360, 365] as const;

/** Rolling specs: `PERIOD_DAYS_SIMPLE` × `DAY_COUNTS`. Plus 30d compound × 360/365 only. */
export const TOKEN_YIELD_SPECS = [
  ...PERIOD_DAYS_SIMPLE.flatMap((periodDays) =>
    DAY_COUNTS.map((dayCount) => ({ periodDays, compounded: false, dayCount }) as const)
  ),
  { periodDays: 30, compounded: true, dayCount: 360 },
  { periodDays: 30, compounded: true, dayCount: 365 },
] as const satisfies readonly TokenYieldPeriodSpec[];

/** Column name: `yield<days>d`, or `yield<days>d360` / `yield<days>d365`, or `yield30dComp360` / `…365`. */
export function tokenYieldFieldName(spec: TokenYieldPeriodSpec): string {
  const comp = spec.compounded ? "Comp" : "";
  const suffix = spec.dayCount === null ? "" : String(spec.dayCount);
  return `yield${spec.periodDays}d${comp}${suffix}`;
}
