import { onchainTable, relations } from "ponder";

export const pools = onchainTable("pools", t => ({
    id: t.bigint().primaryKey(),
    isActive: t.boolean().default(false),
    admin: t.hex().notNull(),
    shareClassManager: t.hex().notNull(),
    currency: t.bigint().notNull(),
}))

export const poolsRelations = relations(pools, ({ one, many }) => ({
  shareClasses: many(shareClasses),
}));

export const shareClasses = onchainTable("shareClasses", t => ({
  id: t.hex().primaryKey(),
  index: t.integer(),
  isActive: t.boolean().default(false),
  poolId: t.bigint(),
  // Metadata fields
  name: t.text(),
  symbol: t.text(),
  salt: t.hex(),
  // Metrics fields
  totalIssuance: t.bigint(),
  navPerShare: t.numeric(),
  // Additional tracking fields
  epochId: t.bigint(),
  shareClassCount: t.bigint(),
}))

export const shareClassesRelations = relations(shareClasses, ({ one }) => ({
  pool: one(pools, { fields: [shareClasses.poolId], references: [pools.id] }),
}));


