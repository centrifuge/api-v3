import { onchainTable, onchainEnum, relations, primaryKey } from "ponder";

export const Pool = onchainTable("pool", (t) => ({
  id: t.bigint().primaryKey(),
  isActive: t.boolean().default(false),
  createdAtBlock: t.integer(),
  createdAt: t.timestamp(),
  admin: t.hex(),
  shareClassManager: t.hex(),
  currency: t.bigint(),
  currentEpochIndex: t.integer().default(1),
}));

export const PoolRelations = relations(Pool, ({ one, many }) => ({
  shareClasses: many(ShareClass),
  epochs: many(Epoch),
  investorTransactions: many(InvestorTransaction),
  outstandingOrders: many(OutstandingOrder),
}));

export const ShareClass = onchainTable("share_class", (t) => ({
  id: t.hex().primaryKey(),
  index: t.integer(),
  isActive: t.boolean().notNull().default(false),
  poolId: t.bigint().notNull(),
  vault: t.hex(),
  // Metadata fields
  name: t.text(),
  symbol: t.text(),
  salt: t.hex(),
  // Metrics fields
  totalIssuance: t.bigint().default(0n),
  navPerShare: t.bigint().default(0n),
}));

export const ShareClassesRelations = relations(ShareClass, ({ one, many }) => ({
  pool: one(Pool, { fields: [ShareClass.poolId], references: [Pool.id] }),
  investorTransactions: many(InvestorTransaction),
  outstandingOrders: many(OutstandingOrder),
}));

export const Epoch = onchainTable(
  "epoch",
  (t) => ({
    poolId: t.bigint().notNull(),
    index: t.integer().notNull(),
    createdAtBlock: t.integer(),
    createdAt: t.timestamp(),
    closedAtBlock: t.integer(),
    closedAt: t.timestamp(),
  }),
  (t) => ({ id: primaryKey({ columns: [t.poolId, t.index] }) })
);

export const EpochRelations = relations(Epoch, ({ one, many }) => ({
  pool: one(Pool, { fields: [Epoch.poolId], references: [Pool.id] }),
  investorTransactions: many(InvestorTransaction),
  outstandingOrders: many(OutstandingOrder),
}));

export const InvestorTransactionType = onchainEnum(
  "investor_transaction_type",
  [
    "DEPOSIT_REQUEST_UPDATED",
    "REDEEM_REQUEST_UPDATED",
    "DEPOSIT_REQUEST_CANCELLED",
    "REDEEM_REQUEST_CANCELLED",
    "DEPOSIT_REQUEST_EXECUTED",
    "REDEEM_REQUEST_EXECUTED",
    "DEPOSIT_CLAIMED",
    "REDEEM_CLAIMED",
  ]
);

export const InvestorTransaction = onchainTable(
  "investor_transaction",
  (t) => ({
    txHash: t.hex().notNull(),
    poolId: t.bigint().notNull(),
    shareClassId: t.hex().notNull(),
    account: t.hex().notNull(),
    type: InvestorTransactionType("investor_transaction_type").notNull(),
    epochIndex: t.integer().notNull(),
    createdAt: t.timestamp().notNull(),
    createdAtBlock: t.integer().notNull(),
    tokenAmount: t.bigint(),
    currencyAmount: t.bigint(),
    tokenPrice: t.bigint(),
    transactionFee: t.bigint(),
  }),
  (t) => ({ id: primaryKey({ columns: [t.txHash, t.epochIndex, t.type] }) })
);

export const InvestorTransactionRelations = relations(
  InvestorTransaction,
  ({ one }) => ({
    pool: one(Pool, {
      fields: [InvestorTransaction.poolId],
      references: [Pool.id],
    }),
    epoch: one(Epoch, {
      fields: [InvestorTransaction.poolId, InvestorTransaction.epochIndex],
      references: [Epoch.poolId, Epoch.index],
    }),
    shareClass: one(ShareClass, {
      fields: [InvestorTransaction.shareClassId],
      references: [ShareClass.id],
    }),
  })
);

export const OutstandingOrder = onchainTable("outstanding_order", (t) => ({
  poolId: t.bigint().notNull(),
  shareClassId: t.hex().notNull(),
  account: t.hex().notNull(),
  updatedAt: t.timestamp(),
  updatedAtBlock: t.integer(),
  epochIndex: t.integer(),
 
  requestedDepositAmount: t.bigint().default(0n),
  approvedDepositAmount: t.bigint().default(0n),

  requestedRedeemAmount: t.bigint().default(0n),
  approvedRedeemAmount: t.bigint().default(0n),
  
}),
  (t) => ({ id: primaryKey({ columns: [t.poolId, t.shareClassId, t.account] }) })
);

export const OutstandingOrderRelations = relations(OutstandingOrder, ({ one }) => ({
  pool: one(Pool, { fields: [OutstandingOrder.poolId], references: [Pool.id] }),
  shareClass: one(ShareClass, { fields: [OutstandingOrder.shareClassId], references: [ShareClass.id] }),
  epoch: one(Epoch, { fields: [OutstandingOrder.poolId, OutstandingOrder.epochIndex], references: [Epoch.poolId, Epoch.index] }),
}));