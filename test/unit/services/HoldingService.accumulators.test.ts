import { describe, expect, it } from "vitest";
import { Holding } from "ponder:schema";
import { HoldingService } from "../../../src/services/HoldingService";
import { testContext } from "../support/testContext";

const TX_HASH = `0x${"ab".repeat(32)}` as `0x${string}`;
const NOW = new Date("2024-06-01T12:00:00Z");

/**
 * Builds a `HoldingService` instance for unit tests.
 *
 * Regression coverage for the operator-precedence bug fixed in PR #453, where
 * `totalValue ?? 0n + diff` parsed as `totalValue ?? (0n + diff)` and silently
 * short-circuited every accumulation once the column was non-null (`0n`).
 */
function holdingRow(overrides: Partial<typeof Holding.$inferSelect> = {}): HoldingService {
  const ctx = testContext();
  const base = {
    centrifugeId: "1",
    poolId: 844424930131969n,
    tokenId: `0x${"11".repeat(32)}`,
    isInitialized: false,
    isLiability: null,
    valuation: null,
    assetId: 1n,
    assetQuantity: 0n,
    totalValue: 0n,
    createdAt: NOW,
    createdAtBlock: 100,
    createdAtTxHash: TX_HASH,
    updatedAt: NOW,
    updatedAtBlock: 100,
    updatedAtTxHash: TX_HASH,
  } satisfies typeof Holding.$inferSelect;

  return new HoldingService(Holding, "Holding", ctx, { ...base, ...overrides });
}

describe("HoldingService.increase (PR #453 regression)", () => {
  it("accumulates assetQuantity and totalValue from a zero starting state", () => {
    const holding = holdingRow({ assetQuantity: 0n, totalValue: 0n });
    holding.increase(100n, 250n);
    expect(holding.read().assetQuantity).toBe(100n);
    expect(holding.read().totalValue).toBe(250n);
  });

  it("accumulates on top of an existing non-zero balance", () => {
    const holding = holdingRow({ assetQuantity: 500n, totalValue: 1_000n });
    holding.increase(100n, 250n);
    expect(holding.read().assetQuantity).toBe(600n);
    expect(holding.read().totalValue).toBe(1_250n);
  });

  it("repeatedly accumulates across many calls (the on-chain Increase pattern)", () => {
    const holding = holdingRow();
    for (let i = 0; i < 5; i++) holding.increase(10n, 20n);
    expect(holding.read().assetQuantity).toBe(50n);
    expect(holding.read().totalValue).toBe(100n);
  });

  it("treats null columns as 0n before adding", () => {
    const holding = holdingRow({ assetQuantity: null, totalValue: null });
    holding.increase(7n, 13n);
    expect(holding.read().assetQuantity).toBe(7n);
    expect(holding.read().totalValue).toBe(13n);
  });
});

describe("HoldingService.decrease (PR #453 regression)", () => {
  it("subtracts from a zero starting state (can go negative, matching on-chain semantics)", () => {
    const holding = holdingRow({ assetQuantity: 0n, totalValue: 0n });
    holding.decrease(100n, 250n);
    expect(holding.read().assetQuantity).toBe(-100n);
    expect(holding.read().totalValue).toBe(-250n);
  });

  it("subtracts from an existing non-zero balance", () => {
    const holding = holdingRow({ assetQuantity: 1_000n, totalValue: 2_000n });
    holding.decrease(100n, 250n);
    expect(holding.read().assetQuantity).toBe(900n);
    expect(holding.read().totalValue).toBe(1_750n);
  });

  it("repeatedly subtracts across many calls (the on-chain Decrease pattern)", () => {
    const holding = holdingRow({ assetQuantity: 1_000n, totalValue: 2_000n });
    for (let i = 0; i < 5; i++) holding.decrease(10n, 20n);
    expect(holding.read().assetQuantity).toBe(950n);
    expect(holding.read().totalValue).toBe(1_900n);
  });

  it("treats null columns as 0n before subtracting", () => {
    const holding = holdingRow({ assetQuantity: null, totalValue: null });
    holding.decrease(7n, 13n);
    expect(holding.read().assetQuantity).toBe(-7n);
    expect(holding.read().totalValue).toBe(-13n);
  });
});

describe("HoldingService.update (PR #453 regression)", () => {
  it("adds diffValue when isPositive is true", () => {
    const holding = holdingRow({ totalValue: 0n });
    holding.update(true, 500n);
    expect(holding.read().totalValue).toBe(500n);
  });

  it("subtracts diffValue when isPositive is false", () => {
    const holding = holdingRow({ totalValue: 1_000n });
    holding.update(false, 300n);
    expect(holding.read().totalValue).toBe(700n);
  });

  it("accumulates across mixed positive and negative updates", () => {
    const holding = holdingRow({ totalValue: 0n });
    holding.update(true, 100n);
    holding.update(true, 50n);
    holding.update(false, 30n);
    holding.update(true, 20n);
    expect(holding.read().totalValue).toBe(140n);
  });

  it("treats a null totalValue as 0n before applying the diff", () => {
    const holding = holdingRow({ totalValue: null });
    holding.update(true, 42n);
    expect(holding.read().totalValue).toBe(42n);
  });
});

describe("HoldingService increase/decrease composition", () => {
  it("net position matches the sum of all Increase/Decrease events", () => {
    const holding = holdingRow();
    holding.increase(1_000n, 2_000n);
    holding.increase(500n, 1_000n);
    holding.decrease(300n, 600n);
    holding.increase(200n, 400n);
    holding.decrease(100n, 200n);
    expect(holding.read().assetQuantity).toBe(1_300n);
    expect(holding.read().totalValue).toBe(2_600n);
  });
});
