import { onchainTable, onchainEnum, relations, primaryKey } from "ponder";

export const Pool = onchainTable("pool", (t) => ({
  id: t.bigint().primaryKey(),
  isActive: t.boolean().default(false),
  admin: t.hex(),
  shareClassManager: t.hex(),
  currency: t.bigint(),
}));

export const PoolRelations = relations(Pool, ({ one, many }) => ({
  shareClasses: many(ShareClass),
  epoches: many(Epoch),
  investorTransactions: many(InvestorTransaction),
}));

export const ShareClass = onchainTable("shareClasse", (t) => ({
  id: t.hex().primaryKey(),
  index: t.integer(),
  isActive: t.boolean().default(false),
  poolId: t.bigint(),
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
}));

export const Epoch = onchainTable(
  "epoch",
  (t) => ({
    poolId: t.bigint().notNull(),
    epochId: t.integer().default(1),
  }),
  (t) => ({ id: primaryKey({ columns: [t.poolId, t.epochId] }) })
);

export const EpochRelations = relations(Epoch, ({ one, many }) => ({
  pool: one(Pool, { fields: [Epoch.poolId], references: [Pool.id] }),
  investorTransactions: many(InvestorTransaction),
}));

export const InvestorTransactionType = onchainEnum("investorTransactionType", [
  "INVEST_ORDER_UPDATE",
  "REDEEM_ORDER_UPDATE",
  "INVEST_ORDER_CANCEL",
  "REDEEM_ORDER_CANCEL",
  "INVEST_EXECUTION",
  "REDEEM_EXECUTION",
  "INVEST_COLLECT",
  "REDEEM_COLLECT",
]);

export const InvestorTransaction = onchainTable("investorTransaction", (t) => ({
  id: t.hex().primaryKey(),
  account: t.hex().notNull(),
  poolId: t.bigint().notNull(),
  epochId: t.integer().notNull(),
  shareClassId: t.hex().notNull(),
  createdAt: t.timestamp().notNull(),
  createdAtBlock: t.integer().notNull(),
  tokenAmount: t.bigint(),
  currencyAmount: t.bigint(),
  tokenPrice: t.bigint(),
  transactionFee: t.bigint(),
  type: InvestorTransactionType("investor_transaction_type").notNull(),
}));

export const InvestorTransactionRelations = relations(InvestorTransaction, ({ one }) => ({
  pool: one(Pool, { fields: [InvestorTransaction.poolId], references: [Pool.id] }),
  epoch: one(Epoch, { fields: [InvestorTransaction.epochId], references: [Epoch.epochId] }),
  shareClass: one(ShareClass, { fields: [InvestorTransaction.shareClassId], references: [ShareClass.id] }),
}));
