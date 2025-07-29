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
  id: t.text().notNull(),
  centrifugeId: t.text().notNull(),
  lastPeriodStart: t.timestamp(),
});

export const Blockchain = onchainTable(
  "blockchain",
  BlockchainColumns,
  (t) => ({
    id: primaryKey({ columns: [t.id] }),
    centrifugeIdIdx: index().on(t.centrifugeId),
  })
);

export const BlockchainRelations = relations(Blockchain, ({ many }) => ({
  pools: many(Pool, { relationName: "pools" }),
  tokens: many(Token, { relationName: "tokens" }),
  tokenInstances: many(TokenInstance, { relationName: "tokenInstances" }),
  vaults: many(Vault, { relationName: "vaults" }),
  assets: many(Asset, { relationName: "assets" }),
  assetRegistrations: many(AssetRegistration, {
    relationName: "assetRegistrations",
  }),
  investorTransactions: many(InvestorTransaction, {
    relationName: "investorTransactions",
  }),
  holdings: many(Holding, { relationName: "holdings" }),
  holdingEscrows: many(HoldingEscrow, { relationName: "holdingEscrows" }),
  escrows: many(Escrow, { relationName: "escrows" }),
}));

const DeploymentColumns = (t: PgColumnsBuilders) => ({
  chainId: t.text().notNull(),
  centrifugeId: t.text().notNull(),
  root: t.hex(),
  guardian: t.hex(),
  gasService: t.hex(),
  gateway: t.hex(),
  multiAdapter: t.hex(),
  messageProcessor: t.hex(),
  messageDispatcher: t.hex(),
  hubRegistry: t.hex(),
  accounting: t.hex(),
  holdings: t.hex(),
  shareClassManager: t.hex(),
  hub: t.hex(),
  identityValuation: t.hex(),
  poolEscrowFactory: t.hex(),
  routerEscrow: t.hex(),
  globalEscrow: t.hex(),
  freezeOnlyHook: t.hex(),
  redemptionRestrictionsHook: t.hex(),
  fullRestrictionsHook: t.hex(),
  tokenFactory: t.hex(),
  asyncRequestManager: t.hex(),
  syncManager: t.hex(),
  asyncVaultFactory: t.hex(),
  syncDepositVaultFactory: t.hex(),
  spoke: t.hex(),
  vaultRouter: t.hex(),
  balanceSheet: t.hex(),
  wormholeAdapter: t.hex(),
  axelarAdapter: t.hex(),
});

export const Deployment = onchainTable(
  "deployment",
  DeploymentColumns,
  (t) => ({
    id: primaryKey({ columns: [t.chainId] }),
    centrifugeIdIdx: index().on(t.centrifugeId),
  })
);

export const DeploymentRelations = relations(Deployment, ({ one }) => ({
  blockchain: one(Blockchain, {
    fields: [Deployment.chainId],
    references: [Blockchain.id],
  }),
}));

const PoolColumns = (t: PgColumnsBuilders) => ({
  id: t.bigint().notNull(),
  centrifugeId: t.text().notNull(),
  isActive: t.boolean().notNull().default(false),
  createdAtBlock: t.integer(),
  createdAt: t.timestamp(),
  shareClassManager: t.text(),
  currency: t.bigint(),
});
export const Pool = onchainTable("pool", PoolColumns, (t) => ({
  id: primaryKey({ columns: [t.id] }),
  isActiveIdx: index().on(t.isActive),
  centrifugeIdIdx: index().on(t.centrifugeId),
}));

export const PoolRelations = relations(Pool, ({ one, many }) => ({
  blockchain: one(Blockchain, {
    fields: [Pool.centrifugeId],
    references: [Blockchain.centrifugeId],
  }),
  tokens: many(Token, { relationName: "tokens" }),
  snapshots: many(PoolSnapshot, { relationName: "snapshots" }),
  managers: many(PoolManager, { relationName: "managers" }),
  policies: many(Policy, { relationName: "policies" }),
}));

const TokenColumns = (t: PgColumnsBuilders) => ({
  id: t.text().notNull(),
  index: t.integer(),
  isActive: t.boolean().notNull().default(false),
  centrifugeId: t.text(),
  poolId: t.bigint().notNull(),
  // Metadata fields
  name: t.text(),
  symbol: t.text(),
  salt: t.text(),
  // Metrics fields
  totalIssuance: t.bigint().default(0n),
  tokenPrice: t.bigint().default(0n),
});
export const Token = onchainTable("token", TokenColumns, (t) => ({
  id: primaryKey({ columns: [t.id] }),
  poolIdx: index().on(t.poolId),
  centrifugeIdIdx: index().on(t.centrifugeId),
}));

export const TokenRelations = relations(Token, ({ one, many }) => ({
  blockchain: one(Blockchain, {
    fields: [Token.centrifugeId],
    references: [Blockchain.centrifugeId],
  }),
  pool: one(Pool, { fields: [Token.poolId], references: [Pool.id] }),
  vaults: many(Vault, { relationName: "vaults" }),
  tokenInstances: many(TokenInstance, { relationName: "tokenInstances" }),
  investorTransactions: many(InvestorTransaction, {
    relationName: "investorTransactions",
  }),
  OutstandingInvests: many(OutstandingInvest, {
    relationName: "OutstandingInvests",
  }),
  onRampAssets: many(OnRampAsset, { relationName: "onRampAssets" }),
  offRampAddresses: many(OffRampAddress, { relationName: "offRampAddresses" }),
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
  id: t.hex().notNull(),
  centrifugeId: t.text().notNull(),
  isActive: t.boolean().default(false).notNull(),
  kind: VaultKind("vault_kind"),
  status: VaultStatus("vault_status"),
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  assetAddress: t.hex().notNull(),
  factory: t.text().notNull(),
  manager: t.text(),
});
export const Vault = onchainTable("vault", VaultColumns, (t) => ({
  id: primaryKey({ columns: [t.id, t.centrifugeId] }),
  centrifugeIdIdx: index().on(t.centrifugeId),
  statusIdx: index().on(t.status),
  tokenIdIdx: index().on(t.tokenId),
}));
export const VaultRelations = relations(Vault, ({ one }) => ({
  blockchain: one(Blockchain, {
    fields: [Vault.centrifugeId],
    references: [Blockchain.centrifugeId],
  }),
  token: one(Token, {
    fields: [Vault.tokenId],
    references: [Token.id],
  }),
  asset: one(Asset, {
    fields: [Vault.assetAddress],
    references: [Asset.address],
  }),
  tokenInstance: one(TokenInstance, {
    fields: [Vault.tokenId],
    references: [TokenInstance.tokenId],
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
    "DEPOSIT_CLAIMABLE",
    "REDEEM_CLAIMABLE",
    "DEPOSIT_CLAIMED",
    "REDEEM_CLAIMED",
    "SYNC_DEPOSIT",
    "SYNC_REDEEM",
  ] as const
);

const InvestorTransactionColumns = (t: PgColumnsBuilders) => ({
  txHash: t.text().notNull(),
  centrifugeId: t.text().notNull(),
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  type: InvestorTransactionType("investor_transaction_type").notNull(),
  account: t.hex().notNull(),
  createdAt: t.timestamp().notNull(),
  createdAtBlock: t.integer().notNull(),
  epochIndex: t.integer(),
  tokenAmount: t.bigint().default(0n),
  currencyAmount: t.bigint().default(0n),
  tokenPrice: t.bigint().default(0n),
  transactionFee: t.bigint().default(0n),
});
export const InvestorTransaction = onchainTable(
  "investor_transaction",
  InvestorTransactionColumns,
  (t) => ({
    id: primaryKey({
      columns: [t.poolId, t.tokenId, t.account, t.type, t.txHash],
    }),
  })
);

export const InvestorTransactionRelations = relations(
  InvestorTransaction,
  ({ one }) => ({
    blockchain: one(Blockchain, {
      fields: [InvestorTransaction.centrifugeId],
      references: [Blockchain.centrifugeId],
    }),
    pool: one(Pool, {
      fields: [InvestorTransaction.poolId],
      references: [Pool.id],
    }),
    token: one(Token, {
      fields: [InvestorTransaction.tokenId],
      references: [Token.id],
    }),
  })
);

const OutstandingInvestColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  assetId: t.bigint().notNull(),
  account: t.hex().notNull(),

  pendingAmount: t.bigint().default(0n), // Amount that is MAYBE in transit from Spoke to Hub, asset denomination
  depositAmount: t.bigint().default(0n), // Amount that is deposited on Hub, asset denomination
  queuedAmount: t.bigint().default(0n), // Amount that is queued onchain for AFTER claim, technically needed, asset denomination
  totalOutstandingAmount: t.bigint().default(0n), // See formula above, that is the POTENTIALLY Cancellable amount available, asset denomination

  updatedAt: t.timestamp(),
  updatedAtBlock: t.integer(),
});

export const OutstandingInvest = onchainTable(
  "outstanding_invest_order",
  OutstandingInvestColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.assetId, t.account] }),
    poolIdx: index().on(t.poolId),
    tokenIdx: index().on(t.tokenId),
    assetIdx: index().on(t.assetId),
  })
);

export const OutstandingInvestRelations = relations(
  OutstandingInvest,
  ({ one }) => ({
    token: one(Token, {
      fields: [OutstandingInvest.tokenId],
      references: [Token.id],
    }),
  })
);

const OutstandingRedeemColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  assetId: t.bigint().notNull(),
  account: t.hex().notNull(),

  pendingAmount: t.bigint().default(0n), // Amount that is MAYBE in transit from Spoke to Hub, share denomination
  depositAmount: t.bigint().default(0n), // Amount that is deposited on Hub, share denomination
  queuedAmount: t.bigint().default(0n), // Amount that is queued onchain for AFTER claim, technically needed, share denomination
  totalOutstandingAmount: t.bigint().default(0n), // See formula above, that is the POTENTIALLY Cancellable amount available, share denomination

  updatedAt: t.timestamp(),
  updatedAtBlock: t.integer(),
});

export const OutstandingRedeem = onchainTable(
  "redeem_outstanding_order",
  OutstandingRedeemColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.assetId, t.account] }),
  })
);

export const OutstandingRedeemRelations = relations(
  OutstandingRedeem,
  ({ one }) => ({
    token: one(Token, {
      fields: [OutstandingRedeem.tokenId],
      references: [Token.id],
    }),
  })
);

const InvestOrderColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  assetId: t.bigint().notNull(),
  account: t.hex().notNull(),
  index: t.integer().notNull(),

  // Approved fields
  approvedAt: t.timestamp(),
  approvedAtBlock: t.integer(),
  approvedAssetsAmount: t.bigint().default(0n), // Asset denomination

  // Issued fields
  issuedSharesAmount: t.bigint().default(0n), // PER USER
  issuedWithNavPoolPerShare: t.bigint().default(0n),
  issuedWithNavAssetPerShare: t.bigint().default(0n),
  issuedAt: t.timestamp(),
  issuedAtBlock: t.integer(),

  // Claimed fields
  claimedAt: t.timestamp(), // Claim action on the Hub, NOT the Spoke side
  claimedAtBlock: t.integer(),



});

export const InvestOrder = onchainTable(
  "invest_order",
  InvestOrderColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.assetId, t.account, t.index] }),
  })
);

const RedeemOrderColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  assetId: t.bigint().notNull(),
  account: t.hex().notNull(),
  index: t.integer().notNull(),

  // Approved fields
  approvedAt: t.timestamp(),
  approvedAtBlock: t.integer(),
  approvedSharesAmount: t.bigint().default(0n), // Share denomination

  // Revoked fields
  revokedAt: t.timestamp(),
  revokedAtBlock: t.integer(),
  revokedAssetsAmount: t.bigint().default(0n), // payout of assets for shares, in asset denomination, PER USER
  revokedPoolAmount: t.bigint().default(0n), // payout of assets for shares, in pool denomination, , PER USER
  revokedWithNavPoolPerShare: t.bigint().default(0n),
  revokedWithNavAssetPerShare: t.bigint().default(0n),

  // Claimed fields
  claimedAt: t.timestamp(), // Claim action on the Hub, NOT the Spoke side
  claimedAtBlock: t.integer(),
});

export const RedeemOrder = onchainTable(
  "redeem_order",
  RedeemOrderColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.assetId, t.account, t.index] }),
  })
);

const EpochOutstandingInvestColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  assetId: t.bigint().notNull(),

  pendingAssetsAmount: t.bigint().default(0n),

  updatedAt: t.timestamp(),
  updatedAtBlock: t.integer(),
});

export const EpochOutstandingInvest = onchainTable(
  "epoch_outstanding_invest",
  EpochOutstandingInvestColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.assetId] }),
  })
);

const EpochOutstandingRedeemColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  assetId: t.bigint().notNull(),

  pendingSharesAmount: t.bigint().default(0n),

  updatedAt: t.timestamp(),
  updatedAtBlock: t.integer(),
});

export const EpochOutstandingRedeem = onchainTable(
  "epoch_outstanding_redeem",
  EpochOutstandingRedeemColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.assetId] }),
  })
);

const EpochInvestOrderColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  assetId: t.bigint().notNull(),
  index: t.integer().notNull(), // required since multiple entries per combination

  // Approved fields
  approvedAt: t.timestamp(),
  approvedAtBlock: t.integer(),
  approvedAssetsAmount: t.bigint().default(0n), // asset denomination
  approvedPoolAmount: t.bigint().default(0n), // pool denomination
  approvedPercentageOfTotalPending: t.bigint().default(0n),

  // Closed fields
  issuedAt: t.timestamp(),
  issuedAtBlock: t.integer(),
  issuedSharesAmount: t.bigint().default(0n),
  issuedWithNavPoolPerShare: t.bigint().default(0n),
  issuedWithNavAssetPerShare: t.bigint().default(0n),
});

export const EpochInvestOrder = onchainTable(
  "epoch_invest_order",
  EpochInvestOrderColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.assetId, t.index] }),
  })
);

const EpochRedeemOrderColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  assetId: t.bigint().notNull(),
  index: t.integer().notNull(), // required

  // Approved fields
  approvedAt: t.timestamp(),
  approvedAtBlock: t.integer(),
  approvedAssetsAmount: t.bigint().default(0n), // asset denomination
  approvedPoolAmount: t.bigint().default(0n), // pool denomination
  approvedPercentageOfTotalPending: t.bigint().default(0n), // percentage value as fixed point would be best

  // Closed fields
  revokedAt: t.timestamp(),
  revokedAtBlock: t.integer(),
  revokedSharesAmount: t.bigint().default(0n),
  revokedAssetsAmount: t.bigint().default(0n), // payout of assets for shares, in asset denomination
  revokedPoolAmount: t.bigint().default(0n), // payout of assets for shares, in pool denomination
  revokedWithNavPoolPerShare: t.bigint().default(0n),
  revokedWithNavAssetPerShare: t.bigint().default(0n),
});

export const EpochRedeemOrder = onchainTable(
  "epoch_redeem_order",
  EpochRedeemOrderColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.assetId, t.index] }),
  })
);

export const AssetRegistrationStatus = onchainEnum(
  "asset_registration_status",
  ["IN_PROGRESS", "REGISTERED"]
);

const AssetRegistrationColumns = (t: PgColumnsBuilders) => ({
  assetId: t.bigint().notNull(),
  centrifugeId: t.text().notNull(),
  assetCentrifugeId: t.text(),
  status: AssetRegistrationStatus("asset_registration_status"),
  decimals: t.integer(),
  name: t.text(),
  symbol: t.text(),
  createdAt: t.timestamp(),
  createdAtBlock: t.integer(),
});
export const AssetRegistration = onchainTable(
  "asset_registration",
  AssetRegistrationColumns,
  (t) => ({
    id: primaryKey({ columns: [t.assetId, t.centrifugeId] }),
  })
);
export const AssetRegistrationRelations = relations(
  AssetRegistration,
  ({ one }) => ({
    blockchain: one(Blockchain, {
      fields: [AssetRegistration.centrifugeId],
      references: [Blockchain.centrifugeId],
    }),
    asset: one(Asset, {
      fields: [AssetRegistration.assetId],
      references: [Asset.id],
    }),
  })
);

const AssetColumns = (t: PgColumnsBuilders) => ({
  id: t.bigint().notNull(),
  centrifugeId: t.text().notNull(),
  address: t.hex().notNull(),
  assetTokenId: t.bigint(),
  decimals: t.integer(),
  name: t.text(),
  symbol: t.text(),
});

export const Asset = onchainTable("asset", AssetColumns, (t) => ({
  id: primaryKey({ columns: [t.id] }),
  centrifugeIdIdx: index().on(t.centrifugeId),
  addressIdx: index().on(t.address),
}));
export const AssetRelations = relations(Asset, ({ one, many }) => ({
  blockchain: one(Blockchain, {
    fields: [Asset.centrifugeId],
    references: [Blockchain.centrifugeId],
  }),
  assetRegistrations: many(AssetRegistration, {
    relationName: "assetRegistrations",
  }),
}));

export const TokenInstanceColumns = (t: PgColumnsBuilders) => ({
  centrifugeId: t.text().notNull(),
  tokenId: t.text().notNull(),
  address: t.hex().notNull(),
  tokenPrice: t.bigint().default(0n),
  computedAt: t.timestamp(),
  totalIssuance: t.bigint().default(0n),
});
export const TokenInstance = onchainTable(
  "token_instance",
  TokenInstanceColumns,
  (t) => ({
    id: primaryKey({ columns: [t.centrifugeId, t.tokenId] }),
    addressIdx: index().on(t.address),
  })
);
export const TokenInstanceRelations = relations(TokenInstance, ({ one, many }) => ({
  blockchain: one(Blockchain, {
    fields: [TokenInstance.centrifugeId],
    references: [Blockchain.centrifugeId],
  }),
  token: one(Token, {
    fields: [TokenInstance.tokenId],
    references: [Token.id],
  }),
  vaults: many(Vault, { relationName: "vaults" }),
}));

const HoldingColumns = (t: PgColumnsBuilders) => ({
  centrifugeId: t.text().notNull(),
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  isInitialized: t.boolean().notNull().default(false),
  isLiability: t.boolean(),
  valuation: t.text(),
  assetId: t.bigint().notNull(),

  // Spoke side amounts and values
  assetQuantity: t.bigint().notNull().default(0n),
  totalValue: t.bigint().notNull().default(0n),

  updatedAt: t.timestamp(),
  updatedAtBlock: t.integer(),
});

export const Holding = onchainTable("holding", HoldingColumns, (t) => ({
  id: primaryKey({ columns: [t.tokenId, t.assetId] }),
  centrifugeIdIdx: index().on(t.centrifugeId),
  poolIdx: index().on(t.poolId),
  tokenIdx: index().on(t.tokenId),
  assetIdx: index().on(t.assetId),
}));

export const HoldingsRelations = relations(Holding, ({ one }) => ({
  blockchain: one(Blockchain, {
    fields: [Holding.centrifugeId],
    references: [Blockchain.centrifugeId],
  }),
  token: one(Token, {
    fields: [Holding.tokenId],
    references: [Token.id],
  }),
  holdingEscrow: one(HoldingEscrow, {
    fields: [Holding.tokenId, Holding.assetId],
    references: [HoldingEscrow.tokenId, HoldingEscrow.assetId],
  }),
}));

export const HoldingAccountTypes = [
  "Asset",
  "Equity",
  "Loss",
  "Gain",
  "Expense",
  "Liability",
] as const;
export const HoldingAccountType = onchainEnum(
  "holding_account_type",
  HoldingAccountTypes
);
export const HoldingAccountColumns = (t: PgColumnsBuilders) => ({
  id: t.text().notNull(),
  tokenId: t.text().notNull(),
  kind: HoldingAccountType("holding_account_type").notNull(),
});

export const HoldingAccount = onchainTable(
  "holding_account",
  HoldingAccountColumns,
  (t) => ({
    id: primaryKey({ columns: [t.id] }),
  })
);

export const HoldingAccountRelations = relations(HoldingAccount, ({ one }) => ({
  holding: one(Holding, {
    fields: [HoldingAccount.tokenId],
    references: [Holding.tokenId],
  }),
}));

export const EscrowColumns = (t: PgColumnsBuilders) => ({
  address: t.hex().notNull(),
  poolId: t.bigint().notNull(),
  centrifugeId: t.text().notNull(),
});

export const Escrow = onchainTable("escrow", EscrowColumns, (t) => ({
  id: primaryKey({ columns: [t.address, t.centrifugeId] }),
  poolIdx: index().on(t.poolId),
  centrifugeIdIdx: index().on(t.centrifugeId),
}));

export const EscrowRelations = relations(Escrow, ({ one, many }) => ({
  blockchain: one(Blockchain, {
    fields: [Escrow.centrifugeId],
    references: [Blockchain.centrifugeId],
  }),
  holdingEscrows: many(HoldingEscrow, { relationName: "holdingEscrows" }),
}));

export const HoldingEscrowColumns = (t: PgColumnsBuilders) => ({
  centrifugeId: t.text().notNull(),
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  assetId: t.bigint().notNull(),
  assetAddress: t.hex().notNull(),
  assetAmount: t.bigint().default(0n),
  assetPrice: t.bigint().default(0n),
  escrowAddress: t.hex().notNull(),
});
export const HoldingEscrow = onchainTable(
  "holding_escrow",
  HoldingEscrowColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.assetId] }),
    poolIdx: index().on(t.poolId),
    tokenIdx: index().on(t.tokenId),
    assetIdx: index().on(t.assetId),
  })
);
export const HoldingEscrowRelations = relations(
  HoldingEscrow,
  ({ one }) => ({
    blockchain: one(Blockchain, {
      fields: [HoldingEscrow.centrifugeId],
      references: [Blockchain.centrifugeId],
    }),
    holding: one(Holding, {
      fields: [HoldingEscrow.tokenId, HoldingEscrow.assetId],
      references: [Holding.tokenId, Holding.assetId],
    }),
    asset: one(Asset, {
      fields: [HoldingEscrow.assetAddress],
      references: [Asset.address],
    }),
    escrow: one(Escrow, {
      fields: [HoldingEscrow.escrowAddress, HoldingEscrow.centrifugeId],
      references: [Escrow.address, Escrow.centrifugeId],
    }),
  })
);

// Snapshots
export const PoolSnapshot = onchainTable(
  "pool_snapshot",
  snapshotColumns(PoolColumns, ["id", "currency"] as const),
  (t) => ({
    id: primaryKey({ columns: [t.id, t.blockNumber, t.trigger] }),
  })
);
export const PoolSnapshotRelations = relations(PoolSnapshot, ({ one }) => ({
  pool: one(Pool, {
    fields: [PoolSnapshot.id],
    references: [Pool.id],
  }),
}));

export const TokenSnapshot = onchainTable(
  "token_snapshot",
  snapshotColumns(TokenColumns, ["id", "tokenPrice", "totalIssuance"] as const),
  (t) => ({
    id: primaryKey({ columns: [t.id, t.blockNumber, t.trigger] }),
  })
);

export const HoldingSnapshot = onchainTable(
  "holding_snapshot",
  snapshotColumns(HoldingColumns, [
    "tokenId",
    "assetId",
    "assetQuantity",
    "totalValue",
  ] as const),
  (t) => ({
    id: primaryKey({
      columns: [t.tokenId, t.assetId, t.blockNumber, t.trigger],
    }),
  })
);

const PoolManagerColumns = (t: PgColumnsBuilders) => ({
  address: t.hex().notNull(),
  centrifugeId: t.text().notNull(),
  poolId: t.bigint().notNull(),
  isHubManager: t.boolean().notNull().default(false),
  isBalancesheetManager: t.boolean().notNull().default(false),
});

export const PoolManager = onchainTable("pool_manager", PoolManagerColumns, (t) => ({
  id: primaryKey({ columns: [t.address, t.centrifugeId, t.poolId] }),
  poolIdx: index().on(t.poolId),
}));

export const PoolManagerRelations = relations(PoolManager, ({ one }) => ({
  pool: one(Pool, {
    fields: [PoolManager.poolId],
    references: [Pool.id],
  }),
}));

const OnRampAssetColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  centrifugeId: t.text().notNull(),
  assetAddress: t.hex().notNull(),
});

export const OnRampAsset = onchainTable("on_ramp_asset", OnRampAssetColumns, (t) => ({
  id: primaryKey({ columns: [t.tokenId, t.assetAddress] }),
  poolIdx: index().on(t.poolId),
  tokenIdx: index().on(t.tokenId),
  assetIdx: index().on(t.assetAddress),
}));

export const OnRampAssetRelations = relations(OnRampAsset, ({ one }) => ({
  token: one(Token, {
    fields: [OnRampAsset.tokenId],
    references: [Token.id],
  }),
  asset: one(Asset, {
    fields: [OnRampAsset.assetAddress, OnRampAsset.centrifugeId],
    references: [Asset.address, Asset.centrifugeId],
  }),
}));

const OffRampAddressColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  centrifugeId: t.text().notNull(),
  assetAddress: t.hex().notNull(),
  receiverAddress: t.hex().notNull(),
});
export const OffRampAddress = onchainTable("off_ramp_address", OffRampAddressColumns, (t) => ({
  id: primaryKey({ columns: [t.tokenId, t.assetAddress, t.receiverAddress] }),
  poolIdx: index().on(t.poolId),
  tokenIdx: index().on(t.tokenId),
  assetIdx: index().on(t.assetAddress),
  receiverIdx: index().on(t.receiverAddress),
}));

export const OffRampAddressRelations = relations(OffRampAddress, ({ one }) => ({
  token: one(Token, {
    fields: [OffRampAddress.tokenId],
    references: [Token.id],
  }),
  asset: one(Asset, {
    fields: [OffRampAddress.assetAddress, OffRampAddress.centrifugeId],
    references: [Asset.address, Asset.centrifugeId],
  }),
}));

const PolicyColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  centrifugeId: t.text().notNull(),
  strategistAddress: t.hex().notNull(),
  root: t.bytes().notNull(),
});

export const Policy = onchainTable("policy", PolicyColumns, (t) => ({
  id: primaryKey({ columns: [t.poolId, t.centrifugeId] }),
  poolIdx: index().on(t.poolId),
  centrifugeIdIdx: index().on(t.centrifugeId),
}));

export const PolicyRelations = relations(Policy, ({ one }) => ({
  pool: one(Pool, {
    fields: [Policy.poolId],
    references: [Pool.id],
  }),
}));


/**
 * Creates a snapshot schema by selecting specific columns from a base table schema
 * @param columns - The base table column definition function
 * @param selectKeys - Array of column keys to include in the snapshot
 * @returns A new column definition function with snapshot-specific columns added
 * @template F - Type of the base column definition function
 * @template O - Array of keys from the base column definition return type
 */
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
      timestamp: t.timestamp().notNull(),
      blockNumber: t.integer().notNull(),
      trigger: t.text().notNull(),
      triggerTxHash: t.hex(),
      triggerChainId: t.text().notNull(),
      ...(selectedColumns as Pick<ReturnType<F>, O[number]>),
    };
    return snapshotColumns;
  };
}
