import { describe, expect, it } from "vitest";
import { SPREAD_PER_SECOND_RAY } from "../../../src/config/sky";
import { SECONDS_PER_YEAR } from "../../../src/helpers/bigintMath";
import { BasinDebtService } from "../../../src/services/BasinDebtService";

const NOW_SECONDS = 1_700_000_000n;

/** Debt state fixture; lastUpdatedAt derived from an elapsed-seconds offset before NOW_SECONDS. */
function debtState(debt: bigint, elapsedSeconds: bigint, ratePerSecondRay = SPREAD_PER_SECOND_RAY) {
  return {
    debt,
    ratePerSecondRay,
    lastUpdatedAt: new Date(Number(NOW_SECONDS - elapsedSeconds) * 1000),
  };
}

describe("BasinDebtService.projectDebt", () => {
  it("returns the debt unchanged when no time has elapsed", () => {
    const state = debtState(10n ** 24n, 0n);
    expect(BasinDebtService.projectDebt(state, NOW_SECONDS)).toBe(10n ** 24n);
  });

  it("returns the debt unchanged when lastUpdatedAt is in the future (clock skew)", () => {
    const state = debtState(10n ** 24n, -60n);
    expect(BasinDebtService.projectDebt(state, NOW_SECONDS)).toBe(10n ** 24n);
  });

  it("does not accrue on zero debt", () => {
    const state = debtState(0n, SECONDS_PER_YEAR);
    expect(BasinDebtService.projectDebt(state, NOW_SECONDS)).toBe(0n);
  });

  it("does not accrue on negative (over-repaid) debt", () => {
    const state = debtState(-5n * 10n ** 20n, SECONDS_PER_YEAR);
    expect(BasinDebtService.projectDebt(state, NOW_SECONDS)).toBe(-5n * 10n ** 20n);
  });

  it("compounds 1M USD over one year at the 30 bps spread-only rate to ~1.003M", () => {
    const oneMillion = 10n ** 24n; // 18 decimals
    const state = debtState(oneMillion, SECONDS_PER_YEAR);
    // Exact regression value: 1e24 * rpow(SPREAD_PER_SECOND_RAY, SECONDS_PER_YEAR) / RAY.
    expect(BasinDebtService.projectDebt(state, NOW_SECONDS)).toBe(
      1_002_999_999_999_999_999_998_507n
    );
  });

  it("accrues strictly monotonically with elapsed time", () => {
    const oneMillion = 10n ** 24n;
    const oneDay = BasinDebtService.projectDebt(debtState(oneMillion, 86_400n), NOW_SECONDS);
    const twoDays = BasinDebtService.projectDebt(debtState(oneMillion, 172_800n), NOW_SECONDS);
    expect(oneDay).toBeGreaterThan(oneMillion);
    expect(twoDays).toBeGreaterThan(oneDay);
  });
});
