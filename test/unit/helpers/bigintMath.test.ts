import { describe, expect, it } from "vitest";
import { RAY, rpow, scaleDecimals, SECONDS_PER_YEAR } from "../../../src/helpers/bigintMath";

describe("scaleDecimals", () => {
  it("returns the amount unchanged for equal precisions", () => {
    expect(scaleDecimals(1_234_567n, 18, 18)).toBe(1_234_567n);
  });

  it("upscales 6 -> 18 decimals (USDC to normalized USD)", () => {
    expect(scaleDecimals(1_000_000n, 6)).toBe(10n ** 18n);
    expect(scaleDecimals(1n, 6, 18)).toBe(10n ** 12n);
  });

  it("downscales 18 -> 6 decimals with flooring", () => {
    expect(scaleDecimals(10n ** 18n, 18, 6)).toBe(1_000_000n);
    expect(scaleDecimals(10n ** 12n - 1n, 18, 6)).toBe(0n);
  });

  it("handles zero", () => {
    expect(scaleDecimals(0n, 6)).toBe(0n);
  });
});

describe("rpow", () => {
  it("returns unit for exponent 0", () => {
    expect(rpow(12_345n, 0n, 10n)).toBe(10n);
    expect(rpow(2n * RAY, 0n)).toBe(RAY);
  });

  it("returns base for exponent 1", () => {
    expect(rpow(3n * RAY, 1n)).toBe(3n * RAY);
  });

  it("computes exact integer powers", () => {
    expect(rpow(2n * RAY, 10n)).toBe(1024n * RAY);
  });

  it("rounds half-up per multiplication step like Sky's rpow", () => {
    // 1.5^2 = 2.25 in unit 10: half-up gives 23, plain flooring would give 22.
    expect(rpow(15n, 2n, 10n)).toBe(23n);
  });

  it("annualizes Sky's published 5% APY per-second rate to 1.05", () => {
    const fivePercentPerSecondRay = 1_000_000_001_547_125_957_863_212_448n;
    const annualized = rpow(fivePercentPerSecondRay, SECONDS_PER_YEAR);
    const expected = RAY + (RAY * 5n) / 100n;
    // The published constant is itself a rounded 31,536,000th root, so allow a
    // sub-1e-16 relative deviation.
    expect(annualized - expected).toBeLessThanOrEqual(0n);
    expect(expected - annualized).toBeLessThan(10n ** 11n);
  });

  it("throws on negative exponents", () => {
    expect(() => rpow(RAY, -1n)).toThrow("negative exponent");
  });
});
