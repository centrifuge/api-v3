import { bigintMax } from "./bigintMath";

export type InvestorPositionCheckpointComputationInput = {
  amount: bigint;
  balanceBefore: bigint;
  balanceAfter: bigint;
  tokenPrice: bigint;
  tokenDecimals: number;
  tokenPriceAtLastChange: bigint | null;
  cumulativeEarningsBefore: bigint;
  costBasisBefore: bigint;
  cumulativeRealizedPnlBefore: bigint;
  isIncrease: boolean;
};

export type InvestorPositionCheckpointComputation = {
  periodEarnings: bigint | null;
  cumulativeEarningsAfter: bigint;
  costBasisAfter: bigint;
  realizedPnl: bigint;
  cumulativeRealizedPnlAfter: bigint;
};

/**
 * Computes an 18-decimal currency value from token-denominated amount and WAD price.
 */
export function computeTokenValue(amount: bigint, tokenPrice: bigint, tokenDecimals: number) {
  return (amount * tokenPrice) / 10n ** BigInt(tokenDecimals);
}

/**
 * Price appreciation on the held balance between position changes, normalized to 18 decimals.
 */
export function computePeriodEarnings(
  balanceBefore: bigint,
  currentTokenPrice: bigint,
  previousTokenPrice: bigint | null,
  tokenDecimals: number
) {
  if (balanceBefore === 0n || previousTokenPrice === null || previousTokenPrice <= 0n) return null;
  return computeTokenValue(balanceBefore, currentTokenPrice - previousTokenPrice, tokenDecimals);
}

/**
 * Realized cost basis removed on a decrease, using direct multiplication/division to avoid
 * an intermediate average-cost bigint rounding step.
 */
export function computeRemovedCostBasis(
  amount: bigint,
  costBasisBefore: bigint,
  balanceBefore: bigint
) {
  if (amount === 0n || costBasisBefore === 0n || balanceBefore === 0n) return 0n;
  return (amount * costBasisBefore) / balanceBefore;
}

/**
 * Computes checkpoint accounting fields for a balance change with a known positive token price.
 */
export function computeInvestorPositionCheckpoint(
  input: InvestorPositionCheckpointComputationInput
): InvestorPositionCheckpointComputation {
  const {
    amount,
    balanceBefore,
    tokenPrice,
    tokenDecimals,
    tokenPriceAtLastChange,
    cumulativeEarningsBefore,
    costBasisBefore,
    cumulativeRealizedPnlBefore,
    isIncrease,
  } = input;

  const periodEarnings = computePeriodEarnings(
    balanceBefore,
    tokenPrice,
    tokenPriceAtLastChange,
    tokenDecimals
  );
  const cumulativeEarningsAfter = cumulativeEarningsBefore + (periodEarnings ?? 0n);

  if (isIncrease) {
    const costBasisAfter = costBasisBefore + computeTokenValue(amount, tokenPrice, tokenDecimals);
    return {
      periodEarnings,
      cumulativeEarningsAfter,
      costBasisAfter,
      realizedPnl: 0n,
      cumulativeRealizedPnlAfter: cumulativeRealizedPnlBefore,
    };
  }

  const removedCostBasis = computeRemovedCostBasis(amount, costBasisBefore, balanceBefore);
  const realizedPnl = computeTokenValue(amount, tokenPrice, tokenDecimals) - removedCostBasis;
  const costBasisAfter = bigintMax(costBasisBefore - removedCostBasis, 0n);

  return {
    periodEarnings,
    cumulativeEarningsAfter,
    costBasisAfter,
    realizedPnl,
    cumulativeRealizedPnlAfter: cumulativeRealizedPnlBefore + realizedPnl,
  };
}
