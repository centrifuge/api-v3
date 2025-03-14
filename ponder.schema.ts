import { onchainTable, onchainEnum, relations, index } from "ponder";

export const investorTransactionType = onchainEnum(
  "investortransactiontype",
  ["INVEST_ORDER_UPDATE", "REDEEM_ORDER_UPDATE", "INVEST_ORDER_CANCEL", "REDEEM_ORDER_CANCEL", "INVEST_EXECUTION", "REDEEM_EXECUTION", "TRANSFER_IN", "TRANSFER_OUT", "INVEST_COLLECT", "REDEEM_COLLECT", "INVEST_LP_COLLECT", "REDEEM_LP_COLLECT"],
);

export const assetTransactionType = onchainEnum(
  "assettransactiontype",
  ["CREATED", "BORROWED", "REPAID", "CLOSED", "CASH_TRANSFER", "DEPOSIT_FROM_INVESTMENTS", "WITHDRAWAL_FOR_REDEMPTIONS", "WITHDRAWAL_FOR_FEES", "INCREASE_DEBT", "DECREASE_DEBT"],
);

export const assetStatus = onchainEnum(
  "assetstatus",
  ["CREATED", "ACTIVE", "CLOSED"],
);

export const assetType = onchainEnum(
  "assettype",
  ["OnchainCash", "OffchainCash", "Other"],
);

export const assetValuationMethod = onchainEnum(
  "assetvaluationmethod",
  ["Cash", "DiscountedCashFlow", "OutstandingDebt", "Oracle"],
);

export const poolFeeStatus = onchainEnum(
  "poolfeestatus",
  ["PROPOSED", "ADDED", "REMOVED"],
);

export const poolFeeType = onchainEnum(
  "poolfeetype",
  ["Fixed", "ChargedUpTo"],
);

export const poolFeeTransactionType = onchainEnum(
  "poolfeetransactiontype",
  ["PROPOSED", "ADDED", "REMOVED", "CHARGED", "UNCHARGED", "PAID", "ACCRUED"],
);

export const timekeeper = onchainTable(
  "timekeeper",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    lastPeriodStart: t.date().notNull(),
  }),
);

export const snapshotPeriod = onchainTable(
  "snapshotPeriod",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    start: t.date().notNull(),
    day: t.integer().notNull(),
    weekDay: t.integer().notNull(),
    month: t.integer().notNull(),
    year: t.integer().notNull(),
  }),
  (table) => ({
    startIdx: index().on(table.start),
    dayIdx: index().on(table.day),
    weekDayIdx: index().on(table.weekDay),
    monthIdx: index().on(table.month),
    yearIdx: index().on(table.year),
  })
);

export const pool = onchainTable(
  "pool",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    blockchainId: t.text().notNull(),
    type: t.text().notNull(),
    isActive: t.boolean().notNull(),
    createdAt: t.date(),
    createdAtBlockNumber: t.integer(),
    currencyId: t.text(),
    metadata: t.text(),
    name: t.text(),
    assetClass: t.text(),
    assetSubclass: t.text(),
    icon: t.text(),
    minEpochTime: t.integer(),
    maxPortfolioValuationAge: t.integer(),
    currentEpoch: t.integer(),
    lastEpochClosed: t.integer(),
    lastEpochExecuted: t.integer(),
    normalizedNAV: t.bigint(),
    netAssetValue: t.bigint(),
    totalReserve: t.bigint(),
    offchainCashValue: t.bigint(),
    portfolioValuation: t.bigint(),
    availableReserve: t.bigint(),
    maxReserve: t.bigint(),
    weightedAverageInterestRatePerSec: t.bigint(),
    sumBorrowedAmountByPeriod: t.bigint(),
    sumRepaidAmountByPeriod: t.bigint(),
    sumPrincipalRepaidAmountByPeriod: t.bigint(),
    sumInterestRepaidAmountByPeriod: t.bigint(),
    sumUnscheduledRepaidAmountByPeriod: t.bigint(),
    sumInvestedAmountByPeriod: t.bigint(),
    sumRedeemedAmountByPeriod: t.bigint(),
    sumNumberOfAssetsByPeriod: t.bigint(),
    sumNumberOfActiveAssets: t.bigint(),
    sumDebt: t.bigint(),
    sumDebtOverdue: t.bigint(),
    sumDebtWrittenOffByPeriod: t.bigint(),
    deltaPortfolioValuationByPeriod: t.bigint(),
    sumInterestAccruedByPeriod: t.bigint(),
    sumPoolFeesChargedAmountByPeriod: t.bigint(),
    sumPoolFeesAccruedAmountByPeriod: t.bigint(),
    sumPoolFeesPaidAmountByPeriod: t.bigint(),
    sumPoolFeesChargedAmount: t.bigint(),
    sumPoolFeesAccruedAmount: t.bigint(),
    sumPoolFeesPaidAmount: t.bigint(),
    sumPoolFeesPendingAmount: t.bigint(),
    sumRealizedProfitFifoByPeriod: t.bigint(),
    sumUnrealizedProfitAtMarketPrice: t.bigint(),
    sumUnrealizedProfitAtNotional: t.bigint(),
    sumUnrealizedProfitByPeriod: t.bigint(),
    sumBorrowedAmount: t.bigint(),
    sumRepaidAmount: t.bigint(),
    sumPrincipalRepaidAmount: t.bigint(),
    sumInterestRepaidAmount: t.bigint(),
    sumUnscheduledRepaidAmount: t.bigint(),
    sumNumberOfAssets: t.bigint(),
    sumBorrowsCount: t.bigint(),
    sumRepaysCount: t.bigint(),
  }),
  (table) => ({
    blockchainIdIdx: index().on(table.blockchainId),
    typeIdx: index().on(table.type),
    isActiveIdx: index().on(table.isActive),
  })
);

export const poolSnapshot = onchainTable(
  "poolSnapshot",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    poolId: t.text().notNull(),
    timestamp: t.date().notNull(),
    blockNumber: t.integer().notNull(),
    periodId: t.text(),
    epochId: t.text(),
    normalizedNAV: t.bigint(),
    netAssetValue: t.bigint(),
    totalReserve: t.bigint(),
    offchainCashValue: t.bigint(),
    portfolioValuation: t.bigint(),
    availableReserve: t.bigint(),
    maxReserve: t.bigint(),
    weightedAverageInterestRatePerSec: t.bigint(),
    sumBorrowedAmountByPeriod: t.bigint(),
    sumRepaidAmountByPeriod: t.bigint(),
    sumPrincipalRepaidAmountByPeriod: t.bigint(),
    sumInterestRepaidAmountByPeriod: t.bigint(),
    sumUnscheduledRepaidAmountByPeriod: t.bigint(),
    sumInvestedAmountByPeriod: t.bigint(),
    sumRedeemedAmountByPeriod: t.bigint(),
    sumNumberOfAssetsByPeriod: t.bigint(),
    sumNumberOfActiveAssets: t.bigint(),
    sumDebt: t.bigint(),
    sumDebtOverdue: t.bigint(),
    sumDebtWrittenOffByPeriod: t.bigint(),
    deltaPortfolioValuationByPeriod: t.bigint(),
    sumInterestAccruedByPeriod: t.bigint(),
    sumPoolFeesChargedAmountByPeriod: t.bigint(),
    sumPoolFeesAccruedAmountByPeriod: t.bigint(),
    sumPoolFeesPaidAmountByPeriod: t.bigint(),
    sumPoolFeesChargedAmount: t.bigint(),
    sumPoolFeesAccruedAmount: t.bigint(),
    sumPoolFeesPaidAmount: t.bigint(),
    sumPoolFeesPendingAmount: t.bigint(),
    sumRealizedProfitFifoByPeriod: t.bigint(),
    sumUnrealizedProfitAtMarketPrice: t.bigint(),
    sumUnrealizedProfitAtNotional: t.bigint(),
    sumUnrealizedProfitByPeriod: t.bigint(),
    sumBorrowedAmount: t.bigint(),
    sumRepaidAmount: t.bigint(),
    sumPrincipalRepaidAmount: t.bigint(),
    sumInterestRepaidAmount: t.bigint(),
    sumUnscheduledRepaidAmount: t.bigint(),
    sumNumberOfAssets: t.bigint(),
    sumBorrowsCount: t.bigint(),
    sumRepaysCount: t.bigint(),
  }),
  (table) => ({
    periodIdIdx: index().on(table.periodId),
    epochIdIdx: index().on(table.epochId),
  })
);

export const tranche = onchainTable(
  "tranche",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    blockchainId: t.text().notNull(),
    type: t.text().notNull(),
    poolId: t.text().notNull(),
    trancheId: t.text().notNull(),
    name: t.text(),
    index: t.integer(),
    isResidual: t.boolean(),
    seniority: t.integer(),
    interestRatePerSec: t.bigint(),
    minRiskBuffer: t.bigint(),
    isActive: t.boolean().notNull(),
    tokenSupply: t.bigint(),
    tokenPrice: t.bigint(),
    sumDebt: t.bigint(),
    sumOutstandingInvestOrdersByPeriod: t.bigint(),
    sumOutstandingRedeemOrdersByPeriod: t.bigint(),
    sumOutstandingRedeemOrdersCurrencyByPeriod: t.bigint(),
    sumFulfilledInvestOrdersByPeriod: t.bigint(),
    sumFulfilledRedeemOrdersByPeriod: t.bigint(),
    sumFulfilledRedeemOrdersCurrencyByPeriod: t.bigint(),
    yield7DaysAnnualized: t.bigint(),
    yield30DaysAnnualized: t.bigint(),
    yield90DaysAnnualized: t.bigint(),
    yieldSinceInception: t.bigint(),
    yieldSinceLastPeriod: t.bigint(),
    yieldMTD: t.bigint(),
    yieldQTD: t.bigint(),
    yieldYTD: t.bigint(),
  }),
  (table) => ({
    blockchainIdIdx: index().on(table.blockchainId),
    typeIdx: index().on(table.type),
    poolIdIdx: index().on(table.poolId),
    isActiveIdx: index().on(table.isActive),
  })
);

export const trancheSnapshot = onchainTable(
  "trancheSnapshot",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    trancheId: t.text().notNull(),
    timestamp: t.date().notNull(),
    blockNumber: t.integer().notNull(),
    periodId: t.text(),
    tokenSupply: t.bigint(),
    tokenPrice: t.bigint(),
    sumDebt: t.bigint(),
    sumOutstandingInvestOrdersByPeriod: t.bigint(),
    sumOutstandingRedeemOrdersByPeriod: t.bigint(),
    sumOutstandingRedeemOrdersCurrencyByPeriod: t.bigint(),
    sumFulfilledInvestOrdersByPeriod: t.bigint(),
    sumFulfilledRedeemOrdersByPeriod: t.bigint(),
    sumFulfilledRedeemOrdersCurrencyByPeriod: t.bigint(),
    yield7DaysAnnualized: t.bigint(),
    yield30DaysAnnualized: t.bigint(),
    yield90DaysAnnualized: t.bigint(),
    yieldSinceInception: t.bigint(),
    yieldSinceLastPeriod: t.bigint(),
    yieldMTD: t.bigint(),
    yieldQTD: t.bigint(),
    yieldYTD: t.bigint(),
  }),
  (table) => ({
    periodIdIdx: index().on(table.periodId),
  })
);

export const epoch = onchainTable(
  "epoch",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    poolId: t.text().notNull(),
    index: t.integer().notNull(),
    openedAt: t.date(),
    closedAt: t.date(),
    executedAt: t.date(),
    sumBorrowedAmount: t.bigint(),
    sumRepaidAmount: t.bigint(),
    sumInvestedAmount: t.bigint(),
    sumRedeemedAmount: t.bigint(),
    sumPoolFeesPaidAmount: t.bigint(),
  }),
);

export const epochState = onchainTable(
  "epochState",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    epochId: t.text().notNull(),
    trancheId: t.text().notNull(),
    tokenPrice: t.bigint(),
    sumOutstandingInvestOrders: t.bigint(),
    sumOutstandingRedeemOrders: t.bigint(),
    sumOutstandingRedeemOrdersCurrency: t.bigint(),
    sumFulfilledInvestOrders: t.bigint(),
    sumFulfilledRedeemOrders: t.bigint(),
    sumFulfilledRedeemOrdersCurrency: t.bigint(),
    investFulfillmentPercentage: t.bigint(),
    redeemFulfillmentPercentage: t.bigint(),
  }),
  (table) => ({
    epochIdIdx: index().on(table.epochId),
  })
);

export const outstandingOrder = onchainTable(
  "outstandingOrder",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    hash: t.text().notNull(),
    accountId: t.text().notNull(),
    poolId: t.text().notNull(),
    trancheId: t.text().notNull(),
    epochNumber: t.integer().notNull(),
    timestamp: t.date().notNull(),
    investAmount: t.bigint().notNull(),
    redeemAmount: t.bigint().notNull(),
  }),
  (table) => ({
    accountIdIdx: index().on(table.accountId),
    poolIdIdx: index().on(table.poolId),
    trancheIdIdx: index().on(table.trancheId),
  })
);

export const investorTransaction = onchainTable(
  "investorTransaction",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    hash: t.text().notNull(),
    accountId: t.text().notNull(),
    poolId: t.text().notNull(),
    trancheId: t.text().notNull(),
    epochNumber: t.integer(),
    timestamp: t.date().notNull(),
    epochId: t.text(),
    type: investorTransactionType("investorTransactionType"),
    tokenAmount: t.bigint(),
    currencyAmount: t.bigint(),
    tokenPrice: t.bigint(),
    transactionFee: t.bigint(),
    realizedProfitFifo: t.bigint(),
  }),
  (table) => ({
    accountIdIdx: index().on(table.accountId),
    poolIdIdx: index().on(table.poolId),
    trancheIdIdx: index().on(table.trancheId),
    epochIdIdx: index().on(table.epochId),
  })
);

export const assetTransaction = onchainTable(
  "assetTransaction",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    timestamp: t.date().notNull(),
    poolId: t.text().notNull(),
    hash: t.text().notNull(),
    accountId: t.text(),
    epochNumber: t.integer().notNull(),
    epochId: t.text().notNull(),
    assetId: t.text().notNull(),
    type: assetTransactionType("assetTransactionType"),
    amount: t.bigint(),
    principalAmount: t.bigint(),
    interestAmount: t.bigint(),
    unscheduledAmount: t.bigint(),
    quantity: t.bigint(),
    settlementPrice: t.bigint(),
    fromAssetId: t.text(),
    toAssetId: t.text(),
    realizedProfitFifo: t.bigint(),
  }),
  (table) => ({
    poolIdIdx: index().on(table.poolId),
    accountIdIdx: index().on(table.accountId),
    epochIdIdx: index().on(table.epochId),
  })
);

export const assetCashflow = onchainTable(
  "assetCashflow",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    assetId: t.text().notNull(),
    timestamp: t.date().notNull(),
    principal: t.bigint().notNull(),
    interest: t.bigint().notNull(),
  }),
  (table) => ({
    assetIdIdx: index().on(table.assetId),
  })
);

export const oracleTransaction = onchainTable(
  "oracleTransaction",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    timestamp: t.date().notNull(),
    key: t.text().notNull(),
    value: t.bigint().notNull(),
  }),
);

export const account = onchainTable(
  "account",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    chainId: t.text().notNull(),
    evmAddress: t.text(),
  }),
  (table) => ({
    evmAddressIdx: index().on(table.evmAddress),
  })
);

export const trancheBalance = onchainTable(
  "trancheBalance",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    accountId: t.text().notNull(),
    poolId: t.text().notNull(),
    trancheId: t.text().notNull(),
    initialisedAt: t.date().notNull(),
    pendingInvestCurrency: t.bigint().notNull(),
    claimableTrancheTokens: t.bigint().notNull(),
    pendingRedeemTrancheTokens: t.bigint().notNull(),
    claimableCurrency: t.bigint().notNull(),
    sumClaimedTrancheTokens: t.bigint().notNull(),
    sumClaimedCurrency: t.bigint().notNull(),
    unrealizedProfit: t.bigint().notNull(),
  }),
  (table) => ({
    accountIdIdx: index().on(table.accountId),
    poolIdIdx: index().on(table.poolId),
    trancheIdIdx: index().on(table.trancheId),
  })
);

export const investorPosition = onchainTable(
  "investorPosition",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    accountId: t.text().notNull(),
    poolId: t.text().notNull(),
    trancheId: t.text().notNull(),
    timestamp: t.date().notNull(),
    holdingQuantity: t.bigint().notNull(),
    purchasePrice: t.bigint().notNull(),
  }),
  (table) => ({
    accountIdIdx: index().on(table.accountId),
    poolIdIdx: index().on(table.poolId),
    trancheIdIdx: index().on(table.trancheId),
  })
);

export const asset = onchainTable(
  "asset",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    createdAt: t.date().notNull(),
    blockchainId: t.text().notNull(),
    type: assetType("assetType"),
    valuationMethod: assetValuationMethod("assetValuationMethod"),
    collateralNftClassId: t.bigint(),
    collateralNftItemId: t.bigint(),
    metadata: t.text(),
    name: t.text(),
    nftId: t.text(),
    advanceRate: t.bigint(),
    collateralValue: t.bigint(),
    probabilityOfDefault: t.bigint(),
    lossGivenDefault: t.bigint(),
    discountRate: t.bigint(),
    interestRatePerSec: t.bigint(),
    isAdminWrittenOff: t.boolean(),
    poolId: t.text().notNull(),
    isActive: t.boolean().notNull(),
    status: assetStatus("assetStatus"),
    outstandingPrincipal: t.bigint(),
    outstandingInterest: t.bigint(),
    outstandingDebt: t.bigint(),
    presentValue: t.bigint(),
    currentPrice: t.bigint(),
    outstandingQuantity: t.bigint(),
    notional: t.bigint(),
    actualMaturityDate: t.date(),
    timeToMaturity: t.integer(),
    actualOriginationDate: t.date(),
    writeOffPercentage: t.bigint(),
    totalBorrowed: t.bigint(),
    totalRepaid: t.bigint(),
    totalRepaidPrincipal: t.bigint(),
    totalRepaidInterest: t.bigint(),
    totalRepaidUnscheduled: t.bigint(),
    borrowsCount: t.bigint(),
    repaysCount: t.bigint(),
    borrowedAmountByPeriod: t.bigint(),
    repaidAmountByPeriod: t.bigint(),
    interestAccruedByPeriod: t.bigint(),
    writeOffIndex: t.integer(),
    writtenOffPercentageByPeriod: t.bigint(),
    writtenOffAmountByPeriod: t.bigint(),
    penaltyInterestRatePerSec: t.bigint(),
    unrealizedProfitAtMarketPrice: t.bigint(),
    unrealizedProfitAtNotional: t.bigint(),
    unrealizedProfitByPeriod: t.bigint(),
    sumRealizedProfitFifo: t.bigint(),
  }),
  (table) => ({
    blockchainIdIdx: index().on(table.blockchainId),
    collateralNftClassIdIdx: index().on(table.collateralNftClassId),
    collateralNftItemIdIdx: index().on(table.collateralNftItemId),
    poolIdIdx: index().on(table.poolId),
    isActiveIdx: index().on(table.isActive),
  })
);

export const assetSnapshot = onchainTable(
  "assetSnapshot",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    assetId: t.text().notNull(),
    timestamp: t.date().notNull(),
    blockNumber: t.integer().notNull(),
    periodId: t.text(),
    outstandingPrincipal: t.bigint(),
    outstandingInterest: t.bigint(),
    outstandingDebt: t.bigint(),
    presentValue: t.bigint(),
    currentPrice: t.bigint(),
    outstandingQuantity: t.bigint(),
    actualMaturityDate: t.date(),
    timeToMaturity: t.integer(),
    actualOriginationDate: t.date(),
    writeOffPercentage: t.bigint(),
    totalBorrowed: t.bigint(),
    totalRepaid: t.bigint(),
    totalRepaidPrincipal: t.bigint(),
    totalRepaidInterest: t.bigint(),
    totalRepaidUnscheduled: t.bigint(),
    borrowedAmountByPeriod: t.bigint(),
    repaidAmountByPeriod: t.bigint(),
    interestAccruedByPeriod: t.bigint(),
    writtenOffPercentageByPeriod: t.bigint(),
    writtenOffAmountByPeriod: t.bigint(),
    penaltyInterestRatePerSec: t.bigint(),
    unrealizedProfitAtMarketPrice: t.bigint(),
    unrealizedProfitAtNotional: t.bigint(),
    unrealizedProfitByPeriod: t.bigint(),
    sumRealizedProfitFifo: t.bigint(),
  }),
  (table) => ({
    periodIdIdx: index().on(table.periodId),
  })
);

export const assetPosition = onchainTable(
  "assetPosition",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    assetId: t.text().notNull(),
    timestamp: t.date().notNull(),
    holdingQuantity: t.bigint().notNull(),
    purchasePrice: t.bigint().notNull(),
  }),
  (table) => ({
    assetIdIdx: index().on(table.assetId),
  })
);

export const pureProxy = onchainTable(
  "pureProxy",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    accountId: t.text().notNull(),
    createdBy: t.text().notNull(),
    proxyType: t.text(),
  }),
  (table) => ({
    accountIdIdx: index().on(table.accountId),
  })
);

export const proxy = onchainTable(
  "proxy",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    delegator: t.text().notNull(),
    delegatee: t.text().notNull(),
    proxyType: t.text(),
    isRemoved: t.boolean(),
    delay: t.bigint(),
  }),
);

export const currency = onchainTable(
  "currency",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    chainId: t.text().notNull(),
    decimals: t.integer().notNull(),
    name: t.text(),
    symbol: t.text(),
    tokenAddress: t.text(),
    escrowAddress: t.text(),
    userEscrowAddress: t.text(),
    poolId: t.text(),
    trancheId: t.text(),
  }),
);

export const currencyBalance = onchainTable(
  "currencyBalance",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    accountId: t.text().notNull(),
    currencyId: t.text().notNull(),
    amount: t.bigint().notNull(),
  }),
  (table) => ({
    accountIdIdx: index().on(table.accountId),
  })
);

export const blockchain = onchainTable(
  "blockchain",
  (t) => ({
    id: t.text().notNull().primaryKey(),
  }),
);

export const poolFee = onchainTable(
  "poolFee",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    feeId: t.text().notNull(),
    type: poolFeeType("poolFeeType"),
    status: poolFeeStatus("poolFeeStatus"),
    isActive: t.boolean().notNull(),
    blockchainId: t.text().notNull(),
    createdAt: t.date(),
    createdAtBlockNumber: t.integer(),
    createdAtEpoch: t.integer(),
    name: t.text(),
    poolId: t.text().notNull(),
    sumChargedAmount: t.bigint(),
    sumAccruedAmount: t.bigint(),
    sumPaidAmount: t.bigint(),
    pendingAmount: t.bigint(),
    sumChargedAmountByPeriod: t.bigint(),
    sumAccruedAmountByPeriod: t.bigint(),
    sumPaidAmountByPeriod: t.bigint(),
  }),
  (table) => ({
    isActiveIdx: index().on(table.isActive),
    blockchainIdIdx: index().on(table.blockchainId),
    poolIdIdx: index().on(table.poolId),
  })
);

export const poolFeeSnapshot = onchainTable(
  "poolFeeSnapshot",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    feeId: t.text().notNull(),
    poolFeeId: t.text().notNull(),
    timestamp: t.date().notNull(),
    blockNumber: t.integer().notNull(),
    periodId: t.text(),
    sumChargedAmount: t.bigint(),
    sumAccruedAmount: t.bigint(),
    sumPaidAmount: t.bigint(),
    pendingAmount: t.bigint(),
    sumChargedAmountByPeriod: t.bigint(),
    sumAccruedAmountByPeriod: t.bigint(),
    sumPaidAmountByPeriod: t.bigint(),
  }),
  (table) => ({
    poolFeeIdIdx: index().on(table.poolFeeId),
    periodIdIdx: index().on(table.periodId),
  })
);

export const poolFeeTransaction = onchainTable(
  "poolFeeTransaction",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    poolFeeId: t.text().notNull(),
    type: poolFeeTransactionType("poolFeeTransactionType"),
    timestamp: t.date().notNull(),
    blockNumber: t.integer().notNull(),
    epochNumber: t.integer().notNull(),
    epochId: t.text().notNull(),
    amount: t.bigint(),
  }),
  (table) => ({
    poolFeeIdIdx: index().on(table.poolFeeId),
  })
);

export const attestation = onchainTable(
  "attestation",
  (t) => ({
    id: t.text().notNull().primaryKey(),
    poolId: t.text().notNull(),
    timestamp: t.date().notNull(),
    accountId: t.text().notNull(),
    data: t.text(),
  }),
  (table) => ({
    accountIdIdx: index().on(table.accountId),
  })
);

export const timekeeperRelations = relations(timekeeper, ({ one, many }) => ({
}));

export const snapshotPeriodRelations = relations(snapshotPeriod, ({ one, many }) => ({
  poolSnapshots: many(poolSnapshot),
  trancheSnapshots: many(trancheSnapshot),
  assetSnapshots: many(assetSnapshot),
  poolFeeSnapshots: many(poolFeeSnapshot),
}));

export const poolRelations = relations(pool, ({ one, many }) => ({
  blockchainId: one(blockchain, { fields: [pool.blockchainId], references: [blockchain.id] }),
  currencyId: one(currency, { fields: [pool.currencyId], references: [currency.id] }),
  tranches: many(tranche),
  assets: many(asset),
}));

export const poolSnapshotRelations = relations(poolSnapshot, ({ one, many }) => ({
  poolId: one(pool, { fields: [poolSnapshot.poolId], references: [pool.id] }),
  periodId: one(snapshotPeriod, { fields: [poolSnapshot.periodId], references: [snapshotPeriod.id] }),
  epochId: one(epoch, { fields: [poolSnapshot.epochId], references: [epoch.id] }),
}));

export const trancheRelations = relations(tranche, ({ one, many }) => ({
  blockchainId: one(blockchain, { fields: [tranche.blockchainId], references: [blockchain.id] }),
  poolId: one(pool, { fields: [tranche.poolId], references: [pool.id] }),
}));

export const trancheSnapshotRelations = relations(trancheSnapshot, ({ one, many }) => ({
  trancheId: one(tranche, { fields: [trancheSnapshot.trancheId], references: [tranche.id] }),
  periodId: one(snapshotPeriod, { fields: [trancheSnapshot.periodId], references: [snapshotPeriod.id] }),
}));

export const epochRelations = relations(epoch, ({ one, many }) => ({
  poolId: one(pool, { fields: [epoch.poolId], references: [pool.id] }),
  epochStates: many(epochState),
  investorTransactions: many(investorTransaction),
  assetTransactions: many(assetTransaction),
  poolFeeTransactions: many(poolFeeTransaction),
}));

export const epochStateRelations = relations(epochState, ({ one, many }) => ({
  epochId: one(epoch, { fields: [epochState.epochId], references: [epoch.id] }),
}));

export const outstandingOrderRelations = relations(outstandingOrder, ({ one, many }) => ({
  accountId: one(account, { fields: [outstandingOrder.accountId], references: [account.id] }),
  poolId: one(pool, { fields: [outstandingOrder.poolId], references: [pool.id] }),
  trancheId: one(tranche, { fields: [outstandingOrder.trancheId], references: [tranche.id] }),
}));

export const investorTransactionRelations = relations(investorTransaction, ({ one, many }) => ({
  accountId: one(account, { fields: [investorTransaction.accountId], references: [account.id] }),
  poolId: one(pool, { fields: [investorTransaction.poolId], references: [pool.id] }),
  trancheId: one(tranche, { fields: [investorTransaction.trancheId], references: [tranche.id] }),
  epochId: one(epoch, { fields: [investorTransaction.epochId], references: [epoch.id] }),
}));

export const assetTransactionRelations = relations(assetTransaction, ({ one, many }) => ({
  poolId: one(pool, { fields: [assetTransaction.poolId], references: [pool.id] }),
  accountId: one(account, { fields: [assetTransaction.accountId], references: [account.id] }),
  epochId: one(epoch, { fields: [assetTransaction.epochId], references: [epoch.id] }),
  assetId: one(asset, { fields: [assetTransaction.assetId], references: [asset.id] }),
  fromAssetId: one(asset, { fields: [assetTransaction.fromAssetId], references: [asset.id] }),
  toAssetId: one(asset, { fields: [assetTransaction.toAssetId], references: [asset.id] }),
}));

export const assetCashflowRelations = relations(assetCashflow, ({ one, many }) => ({
  assetId: one(asset, { fields: [assetCashflow.assetId], references: [asset.id] }),
}));

export const oracleTransactionRelations = relations(oracleTransaction, ({ one, many }) => ({
}));

export const accountRelations = relations(account, ({ one, many }) => ({
  chainId: one(blockchain, { fields: [account.chainId], references: [blockchain.id] }),
  pureProxies: many(pureProxy),
  investorTransactions: many(investorTransaction),
  assetTransactions: many(assetTransaction),
  outstandingOrders: many(outstandingOrder),
  trancheBalances: many(trancheBalance),
  currencyBalances: many(currencyBalance),
}));

export const trancheBalanceRelations = relations(trancheBalance, ({ one, many }) => ({
  accountId: one(account, { fields: [trancheBalance.accountId], references: [account.id] }),
  poolId: one(pool, { fields: [trancheBalance.poolId], references: [pool.id] }),
  trancheId: one(tranche, { fields: [trancheBalance.trancheId], references: [tranche.id] }),
}));

export const investorPositionRelations = relations(investorPosition, ({ one, many }) => ({
  accountId: one(account, { fields: [investorPosition.accountId], references: [account.id] }),
  poolId: one(pool, { fields: [investorPosition.poolId], references: [pool.id] }),
  trancheId: one(tranche, { fields: [investorPosition.trancheId], references: [tranche.id] }),
}));

export const assetRelations = relations(asset, ({ one, many }) => ({
  blockchainId: one(blockchain, { fields: [asset.blockchainId], references: [blockchain.id] }),
  poolId: one(pool, { fields: [asset.poolId], references: [pool.id] }),
  positions: many(assetPosition),
}));

export const assetSnapshotRelations = relations(assetSnapshot, ({ one, many }) => ({
  assetId: one(asset, { fields: [assetSnapshot.assetId], references: [asset.id] }),
  periodId: one(snapshotPeriod, { fields: [assetSnapshot.periodId], references: [snapshotPeriod.id] }),
}));

export const assetPositionRelations = relations(assetPosition, ({ one, many }) => ({
  assetId: one(asset, { fields: [assetPosition.assetId], references: [asset.id] }),
}));

export const pureProxyRelations = relations(pureProxy, ({ one, many }) => ({
  accountId: one(account, { fields: [pureProxy.accountId], references: [account.id] }),
}));

export const proxyRelations = relations(proxy, ({ one, many }) => ({
}));

export const currencyRelations = relations(currency, ({ one, many }) => ({
  chainId: one(blockchain, { fields: [currency.chainId], references: [blockchain.id] }),
  poolId: one(pool, { fields: [currency.poolId], references: [pool.id] }),
  trancheId: one(tranche, { fields: [currency.trancheId], references: [tranche.id] }),
}));

export const currencyBalanceRelations = relations(currencyBalance, ({ one, many }) => ({
  accountId: one(account, { fields: [currencyBalance.accountId], references: [account.id] }),
  currencyId: one(currency, { fields: [currencyBalance.currencyId], references: [currency.id] }),
}));

export const blockchainRelations = relations(blockchain, ({ one, many }) => ({
}));

export const poolFeeRelations = relations(poolFee, ({ one, many }) => ({
  blockchainId: one(blockchain, { fields: [poolFee.blockchainId], references: [blockchain.id] }),
  poolId: one(pool, { fields: [poolFee.poolId], references: [pool.id] }),
}));

export const poolFeeSnapshotRelations = relations(poolFeeSnapshot, ({ one, many }) => ({
  poolFeeId: one(poolFee, { fields: [poolFeeSnapshot.poolFeeId], references: [poolFee.id] }),
  periodId: one(snapshotPeriod, { fields: [poolFeeSnapshot.periodId], references: [snapshotPeriod.id] }),
}));

export const poolFeeTransactionRelations = relations(poolFeeTransaction, ({ one, many }) => ({
  poolFeeId: one(poolFee, { fields: [poolFeeTransaction.poolFeeId], references: [poolFee.id] }),
  epochId: one(epoch, { fields: [poolFeeTransaction.epochId], references: [epoch.id] }),
}));

export const attestationRelations = relations(attestation, ({ one, many }) => ({
  poolId: one(pool, { fields: [attestation.poolId], references: [pool.id] }),
  accountId: one(account, { fields: [attestation.accountId], references: [account.id] }),
}));

