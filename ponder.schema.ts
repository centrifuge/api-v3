import {
  onchainTable,
  onchainEnum,
  relations,
  primaryKey,
  index,
} from "ponder";

type PgColumnsFunction = Extract<Parameters<typeof onchainTable>[1], Function>;
type PgColumnsBuilders = Parameters<PgColumnsFunction>[0];

const BlockchainColumns = (t: PgColumnsBuilders) => ({
  id: t.text().primaryKey(),
  centrifugeId: t.text().notNull(),
  lastPeriodStart: t.timestamp(),
});
export const Blockchain = onchainTable(
  "blockchain",
  BlockchainColumns,
  (t) => ({
    centrifugeIdIdx: index().on(t.centrifugeId),
  })
);

export const BlockchainRelations = relations(Blockchain, ({ many }) => ({
  pools: many(Pool, { relationName: "pools" }),
  vaults: many(Vault, { relationName: "vaults" }),
  localAssets: many(LocalAsset, { relationName: "localAssets" }),
  localTokens: many(LocalToken, { relationName: "localTokens" }),
}));

const PoolColumns = (t: PgColumnsBuilders) => ({
  id: t.text().primaryKey(),
  centrifugeId: t.text().notNull(),
  isActive: t.boolean().default(false).notNull(),
  createdAtBlock: t.integer(),
  createdAt: t.timestamp(),
  admin: t.text(),
  shareClassManager: t.text(),
  currency: t.bigint(),
  currentEpochIndex: t.integer().default(1),
});
export const Pool = onchainTable("pool", PoolColumns, (t) => ({
  isActiveIdx: index().on(t.isActive),
  centrifugeIdIdx: index().on(t.centrifugeId),
}));

export const PoolRelations = relations(Pool, ({ one, many }) => ({
  blockchain: one(Blockchain, {
    fields: [Pool.centrifugeId],
    references: [Blockchain.centrifugeId],
  }),
  shareClasses: many(ShareClass, { relationName: "shareClasses" }),
  epochs: many(Epoch, { relationName: "epochs" }),
  snapshots: many(PoolSnapshot, { relationName: "snapshots" }),
}));

const ShareClassColumns = (t: PgColumnsBuilders) => ({
  id: t.text().primaryKey(),
  index: t.integer(),
  isActive: t.boolean().notNull().default(false),
  poolId: t.text().notNull(),
  // Metadata fields
  name: t.text(),
  symbol: t.text(),
  salt: t.text(),
  // Metrics fields
  totalIssuance: t.bigint().default(0n),
  navPerShare: t.bigint().default(0n),
});
export const ShareClass = onchainTable("share_class", ShareClassColumns, (t) => ({
  poolIdx: index().on(t.poolId),
}));

export const ShareClassesRelations = relations(ShareClass, ({ one, many }) => ({
  pool: one(Pool, { fields: [ShareClass.poolId], references: [Pool.id] }),
  vault: one(Vault, { fields: [ShareClass.id], references: [Vault.shareClassId] }),
  token: one(Token, { fields: [ShareClass.id], references: [Token.shareClassId] }),
  investorTransactions: many(InvestorTransaction, { relationName: "investorTransactions" }),
  outstandingOrders: many(OutstandingOrder, { relationName: "outstandingOrders" }),
}));

const EpochColumns = (t: PgColumnsBuilders) => ({
  poolId: t.text().notNull(),
  index: t.integer().notNull(),
  createdAtBlock: t.integer(),
  createdAt: t.timestamp(),
  closedAtBlock: t.integer(),
  closedAt: t.timestamp(),
});
export const Epoch = onchainTable("epoch", EpochColumns, (t) => ({
  id: primaryKey({ columns: [t.poolId, t.index] }),
}));

export const EpochRelations = relations(Epoch, ({ one, many }) => ({
  pool: one(Pool, { fields: [Epoch.poolId], references: [Pool.id] }),
  investorTransactions: many(InvestorTransaction, { relationName: "investorTransactions" }),
}));

export const VaultKinds = ["Async", "Sync", "SyncDepositAsyncRedeem"] as const;
export const VaultKind = onchainEnum("vault_kind", VaultKinds);
export const VaultStatuses = [
  "LinkInProgress",
  "UnlinkInProgress",
  "Linked",
  "Unlinked",
] as const;
export const VaultStatus = onchainEnum("vault_status", VaultStatuses);
const VaultColumns = (t: PgColumnsBuilders) => ({
  id: t.text().primaryKey(),
  centrifugeId: t.text().notNull(),
  isActive: t.boolean().default(false).notNull(),
  kind: VaultKind("vault_kind"),
  status: VaultStatus("vault_status"),
  poolId: t.text().notNull(),
  shareClassId: t.text().notNull(),
  localAssetAddress: t.text().notNull(),
  factory: t.text().notNull(),
  manager: t.text(),
  tokenId: t.text().notNull(),
});
export const Vault = onchainTable("vault", VaultColumns, (t) => ({
  centrifugeIdIdx: index().on(t.centrifugeId),
  statusIdx: index().on(t.status),
  shareClassIdIdx: index().on(t.shareClassId),
}));
export const VaultRelations = relations(Vault, ({ one }) => ({
  blockchain: one(Blockchain, {
    fields: [Vault.centrifugeId],
    references: [Blockchain.centrifugeId],
  }),
  shareClass: one(ShareClass, {
    fields: [Vault.shareClassId],
    references: [ShareClass.id],
  }),
  localAsset: one(LocalAsset, {
    fields: [Vault.localAssetAddress],
    references: [LocalAsset.address],
  }),
  localToken: one(LocalToken, {
    fields: [Vault.shareClassId],
    references: [LocalToken.shareClassId],
  }),
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

const InvestorTransactionColumns = (t: PgColumnsBuilders) => ({
  txHash: t.text().notNull(),
  poolId: t.text().notNull(),
  shareClassId: t.text().notNull(),
  type: InvestorTransactionType("investor_transaction_type").notNull(),
  account: t.text().notNull(),
  createdAt: t.timestamp().notNull(),
  createdAtBlock: t.integer().notNull(),
  epochIndex: t.integer(),
  tokenAmount: t.bigint(),
  currencyAmount: t.bigint(),
  tokenPrice: t.bigint(),
  transactionFee: t.bigint(),
});
export const InvestorTransaction = onchainTable(
  "investor_transaction",
  InvestorTransactionColumns,
  (t) => ({
    id: primaryKey({
      columns: [t.poolId, t.shareClassId, t.account, t.type, t.txHash],
    }),
  })
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

const OutstandingOrderColumns = (t: PgColumnsBuilders) => ({
  poolId: t.text().notNull(),
  shareClassId: t.text().notNull(),
  account: t.text().notNull(),
  updatedAt: t.timestamp(),
  updatedAtBlock: t.integer(),

  requestedDepositAmount: t.bigint().default(0n),
  approvedDepositAmount: t.bigint().default(0n),

  requestedRedeemAmount: t.bigint().default(0n),
  approvedRedeemAmount: t.bigint().default(0n),
});

export const OutstandingOrder = onchainTable(
  "outstanding_order",
  OutstandingOrderColumns,
  (t) => ({
    id: primaryKey({ columns: [t.poolId, t.shareClassId, t.account] }),
    poolIdx: index().on(t.poolId),
    shareClassIdx: index().on(t.shareClassId),
  })
);

export const OutstandingOrderRelations = relations(
  OutstandingOrder,
  ({ one }) => ({
    shareClass: one(ShareClass, {
      fields: [OutstandingOrder.shareClassId],
      references: [ShareClass.id],
    }),
  })
);

const AssetColumns = (t: PgColumnsBuilders) => ({
  id: t.text().primaryKey(),
  centrifugeId: t.text(),
  decimals: t.integer(),
  name: t.text(),
  symbol: t.text(),
  createdAt: t.timestamp(),
  createdAtBlock: t.integer(),
});
export const Asset = onchainTable("asset", AssetColumns);
export const AssetRelations = relations(Asset, ({ one, many }) => ({
  blockchain: one(Blockchain, {
    fields: [Asset.centrifugeId],
    references: [Blockchain.centrifugeId],
  }),
  localAssets: many(LocalAsset, { relationName: "localAssets" }),
}));

const LocalAssetColumns = (t: PgColumnsBuilders) => ({
  assetId: t.text().notNull(),
  centrifugeId: t.text().notNull(),
  address: t.text(),
  name: t.text(),
  symbol: t.text(),
  status: LocalAssetStatus("local_asset_status"),
});

export const LocalAssetStatus = onchainEnum("local_asset_status", [
  "IN_PROGRESS",
  "REGISTERED",
]);
export const LocalAsset = onchainTable(
  "local_asset",
  LocalAssetColumns,
  (t) => ({
    id: primaryKey({ columns: [t.assetId, t.centrifugeId] }),
  })
);
export const LocalAssetRelations = relations(LocalAsset, ({ one }) => ({
  blockchain: one(Blockchain, {
    fields: [LocalAsset.centrifugeId],
    references: [Blockchain.centrifugeId],
  }),
  asset: one(Asset, { fields: [LocalAsset.assetId], references: [Asset.id] }),
}));

export const TokenColumns = (t: PgColumnsBuilders) => ({
  id: t.text().primaryKey(),
  poolId: t.text().notNull(),
  shareClassId: t.text().notNull(),
});
export const Token = onchainTable("token", TokenColumns);
export const TokenRelations = relations(Token, ({ one, many }) => ({
  shareClass: one(ShareClass, {
    fields: [Token.shareClassId],
    references: [ShareClass.id],
  }),
  localTokens: many(LocalToken, { relationName: "localTokens" }),
}));

export const LocalTokenColumns = (t: PgColumnsBuilders) => ({
  address: t.text().primaryKey(),
  centrifugeId: t.text().notNull(),
  shareClassId: t.text().notNull()
});
export const LocalToken = onchainTable("local_token", LocalTokenColumns);
export const LocalTokenRelations = relations(LocalToken, ({ one }) => ({
  blockchain: one(Blockchain, {
    fields: [LocalToken.centrifugeId],
    references: [Blockchain.centrifugeId],
  }),
  token: one(Token, {
    fields: [LocalToken.shareClassId],
    references: [Token.shareClassId],
  }),
}));

const HoldingColumns = (t: PgColumnsBuilders) => ({
  poolId: t.text().notNull(),
  shareClassId: t.text().primaryKey(),
  assetId: t.text().notNull(),
  valuation: t.text().notNull(),
  isLiability: t.boolean().notNull(),
  pendingAssetAmountIncrease: t.bigint().default(0n),
  pendingAssetAmountDecrease: t.bigint().default(0n),
  pendingAssetValueIncrease: t.bigint().default(0n),
  pendingAssetValueDecrease: t.bigint().default(0n),
  realizedAssetAmount: t.bigint().default(0n),
  realizedAssetValue: t.bigint().default(0n),
  assetAmount: t.bigint().default(0n),
  assetValue: t.bigint().default(0n),
  updatedAt: t.timestamp(),
  updatedAtBlock: t.integer(),
});

export const Holding = onchainTable("holdings", HoldingColumns, (t) => ({
  poolIdx: index().on(t.poolId),
}));

export const HoldingsRelations = relations(Holding, ({ one }) => ({
  shareClass: one(ShareClass, {
    fields: [Holding.shareClassId],
    references: [ShareClass.id],
  }),
}));

export const HoldingAccountTypes = ["Asset", "Equity", "Loss", "Gain", "Expense", "Liability"] as const;
export const HoldingAccountType = onchainEnum("holding_account_type", HoldingAccountTypes);
export const HoldingAccountColumns = (t: PgColumnsBuilders) => ({
  id: t.text().primaryKey(),
  shareClassId: t.text().notNull(),
  kind: HoldingAccountType("holding_account_type").notNull(),
});

export const HoldingAccount = onchainTable("holding_accounts", HoldingAccountColumns, (t) => ({
}));

export const HoldingAccountRelations = relations(HoldingAccount, ({ one }) => ({
  holding: one(Holding, {
    fields: [HoldingAccount.shareClassId],
    references: [Holding.shareClassId],
  }),
}));


// Snapshots
export const PoolSnapshot = onchainTable(
  "pool_snapshot",
  snapshotColumns(PoolColumns, ["currency"] as const),
  (t) => ({
    id: primaryKey({ columns: [t.id, t.blockNumber] }),
  })
);
export const PoolSnapshotRelations = relations(PoolSnapshot, ({ one }) => ({
  pool: one(Pool, {
    fields: [PoolSnapshot.id],
    references: [Pool.id],
  }),
}));

export const ShareClassSnapshot = onchainTable(
  "share_class_snapshot",
  snapshotColumns(ShareClassColumns, ["navPerShare", "totalIssuance"] as const),
  (t) => ({
    id: primaryKey({ columns: [t.id, t.blockNumber] }),
  })
);

function snapshotColumns<
  F extends PgColumnsFunction,
  O extends Array<keyof ReturnType<F>>
>(columns: F, selectKeys: O) {
  return (t: Parameters<F>[0]) => {
    const initialColumns = columns(t);
    const entries = Object.entries(initialColumns);
    const selectedColumns = Object.fromEntries(
      entries.filter(([key]) => selectKeys.includes(key as keyof ReturnType<F>))
    );
    const snapshotColumns = {
      id: t.text().notNull(),
      timestamp: t.timestamp().notNull(),
      blockNumber: t.integer().notNull(),
      ...(selectedColumns as Pick<ReturnType<F>, O[number]>),
    };
    return snapshotColumns;
  };
}
