/**
 * Hub token yield config: rolling windows, column names. Units: prices on-chain bigint; yields signed Ray ({@link ../helpers/bigintMath.ts}).
 */

export type TokenYieldPeriodSpec = {
  readonly periodDays: number;
  readonly compounded: boolean;
  /** `null` → column `yield{days}d` (simple total return); `360`/`365` → annualized suffix. */
  readonly dayCount: 360 | 365 | null;
};

/** Rolling window lengths (days). */
export const PERIOD_DAYS_SIMPLE = [1, 7, 15, 30, 90, 180] as const;

/** With each simple window: `null` = plain `yieldNd`, else `yieldNd360` / `yieldNd365`. */
export const DAY_COUNTS = [null, 360, 365] as const;

/** Cartesian product of {@link PERIOD_DAYS_SIMPLE} × {@link DAY_COUNTS}, plus 30d compound × 360/365. */
export const TOKEN_YIELD_SPECS = [
  ...PERIOD_DAYS_SIMPLE.flatMap((periodDays) =>
    DAY_COUNTS.map((dayCount) => ({ periodDays, compounded: false, dayCount }) as const)
  ),
  { periodDays: 30, compounded: true, dayCount: 360 },
  { periodDays: 30, compounded: true, dayCount: 365 },
] as const satisfies readonly TokenYieldPeriodSpec[];

/** DB column name for a spec (e.g. `yield7d`, `yield7d365`, `yield30dComp360`). */
export function tokenYieldFieldName(spec: TokenYieldPeriodSpec): string {
  const comp = spec.compounded ? "Comp" : "";
  const suffix = spec.dayCount === null ? "" : String(spec.dayCount);
  return `yield${spec.periodDays}d${comp}${suffix}`;
}
