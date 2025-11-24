import {
  onchainTable,
  onchainEnum,
  relations,
  primaryKey,
  index,
} from "ponder";
import { contracts } from "./ponder.config";

type PgColumnsFunction = Extract<Parameters<typeof onchainTable>[1], Function>;
type PgColumnsBuilders = Parameters<PgColumnsFunction>[0];
type PgColumn<T extends keyof PgColumnsBuilders> = ReturnType<
  PgColumnsBuilders[T]
>;

const BlockchainColumns = (t: PgColumnsBuilders) => ({
  id: t.text().notNull(),
  centrifugeId: t.text().notNull(),
  network: t.text().notNull(),
  lastPeriodStart: t.timestamp(),
  chainId: t.integer(),
  environment: t.text(),
  name: t.text(),
  explorer: t.text(),
  alchemyName: t.text(),
  quicknodeName: t.text(),
  icon: t.text(),
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
  hubPools: many(Pool, { relationName: "pools" }),
  spokePools: many(PoolSpokeBlockchain, {
    relationName: "poolSpokeBlockchains",
  }),
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

const currentContractFields = (t: PgColumnsBuilders) =>
  Object.fromEntries(
    contracts.map((contract) => [contract, t.hex()])
  ) as Record<(typeof currentContractNames)[number], PgColumn<"hex">>;
const DeploymentColumns = (t: PgColumnsBuilders) => ({
  chainId: t.text().notNull(),
  centrifugeId: t.text().notNull(),
  ...currentContractFields(t),
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
  isActive: t.boolean().notNull().default(true),
  currency: t.bigint(),
  decimals: t.integer(),
  metadata: t.text(),
  name: t.text(),
  ...defaultColumns(t),
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
  spokeBlockchains: many(PoolSpokeBlockchain, {
    relationName: "poolSpokeBlockchains",
  }),
  asset: one(Asset, {
    fields: [Pool.currency],
    references: [Asset.id],
  }),
  tokens: many(Token, { relationName: "tokens" }),
  snapshots: many(PoolSnapshot, { relationName: "snapshots" }),
  managers: many(PoolManager, { relationName: "managers" }),
  policies: many(Policy, { relationName: "policies" }),
  merkleProofManagers: many(MerkleProofManager, {
    relationName: "merkleProofManagers",
  }),
}));

const PoolSpokeBlockchainColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  centrifugeId: t.text().notNull(),
  ...defaultColumns(t, false),
});

export const PoolSpokeBlockchain = onchainTable(
  "pool_spoke_blockchain",
  PoolSpokeBlockchainColumns,
  (t) => ({
    id: primaryKey({ columns: [t.poolId, t.centrifugeId] }),
    poolIdx: index().on(t.poolId),
    centrifugeIdIdx: index().on(t.centrifugeId),
  })
);

export const PoolSpokeBlockchainRelations = relations(
  PoolSpokeBlockchain,
  ({ one }) => ({
    pool: one(Pool, {
      fields: [PoolSpokeBlockchain.poolId],
      references: [Pool.id],
    }),
    blockchain: one(Blockchain, {
      fields: [PoolSpokeBlockchain.centrifugeId],
      references: [Blockchain.centrifugeId],
    }),
  })
);

const TokenColumns = (t: PgColumnsBuilders) => ({
  id: t.text().notNull(),
  index: t.integer(),
  isActive: t.boolean().notNull().default(false),
  centrifugeId: t.text(),
  poolId: t.bigint().notNull(),
  decimals: t.integer(),
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
  onOffRampManagers: many(OnOffRampManager, {
    relationName: "onOffRampManagers",
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
    "TRANSFER_IN",
    "TRANSFER_OUT",
  ] as const
);

const InvestorTransactionColumns = (t: PgColumnsBuilders) => ({
  txHash: t.text().notNull(),
  centrifugeId: t.text().notNull(),
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  type: InvestorTransactionType("investor_transaction_type").notNull(),
  account: t.hex().notNull(),
  epochIndex: t.integer(),
  tokenAmount: t.bigint().default(0n),
  currencyAmount: t.bigint().default(0n),
  tokenPrice: t.bigint().default(0n),
  transactionFee: t.bigint().default(0n),
  fromAccount: t.hex(),
  toAccount: t.hex(),
  fromCentrifugeId: t.text(),
  toCentrifugeId: t.text(),
  currencyAssetId: t.bigint(),
  ...defaultColumns(t, false),
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
    currencyAsset: one(Asset, {
      fields: [InvestorTransaction.currencyAssetId],
      references: [Asset.id],
    }),
  })
);

const WhitelistedInvestorColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  accountAddress: t.hex().notNull(),
  centrifugeId: t.text().notNull(),
  isFrozen: t.boolean().notNull().default(false),
  validUntil: t.timestamp(),
  ...defaultColumns(t),
});

export const WhitelistedInvestor = onchainTable(
  "whitelisted_investor",
  WhitelistedInvestorColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.centrifugeId, t.accountAddress] }),
    poolIdx: index().on(t.poolId),
    tokenIdx: index().on(t.tokenId),
    accountAddressIdx: index().on(t.accountAddress),
    centrifugeIdIdx: index().on(t.centrifugeId),
  })
);
export const WhitelistedInvestorRelations = relations(
  WhitelistedInvestor,
  ({ one }) => ({
    token: one(Token, {
      fields: [WhitelistedInvestor.tokenId],
      references: [Token.id],
    }),
    account: one(Account, {
      fields: [WhitelistedInvestor.accountAddress],
      references: [Account.address],
    }),
  })
);

const OutstandingInvestColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  assetId: t.bigint().notNull(),
  account: t.hex().notNull(),

  pendingAmount: t.bigint().default(0n), // Amount that is MAYBE in transit from Spoke to Hub, asset denomination

  queuedAmount: t.bigint().default(0n), // Amount that is queued onchain for AFTER claim, technically needed, asset denomination
  depositAmount: t.bigint().default(0n), // Amount that is deposited on Hub, asset denomination

  approvedIndex: t.integer(),
  approvedAmount: t.bigint().default(0n), // Amount that is approved on Hub, asset denomination
  approvedAt: t.timestamp(),
  approvedAtBlock: t.integer(),

  updatedAt: t.timestamp(),
  updatedAtBlock: t.integer(),
});

export const OutstandingInvest = onchainTable(
  "outstanding_invest_order",
  OutstandingInvestColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.assetId, t.account] }),
    approvedIndexIdx: index().on(t.approvedIndex),
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

  depositAmount: t.bigint().default(0n), // Amount that is deposited on Hub, share denomination

  pendingAmount: t.bigint().default(0n), // Amount that is MAYBE in transit from Spoke to Hub, share denomination
  queuedAmount: t.bigint().default(0n), // Amount that is queued onchain for AFTER claim, technically needed, share denomination

  approvedIndex: t.integer(),
  approvedAmount: t.bigint().default(0n), // Amount that is approved on Hub, share denomination
  approvedAt: t.timestamp(),
  approvedAtBlock: t.integer(),

  updatedAt: t.timestamp(),
  updatedAtBlock: t.integer(),
});

export const OutstandingRedeem = onchainTable(
  "redeem_outstanding_order",
  OutstandingRedeemColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.assetId, t.account] }),
    approvedIndexIdx: index().on(t.approvedIndex),
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
    poolIdx: index().on(t.poolId),
    tokenIdx: index().on(t.tokenId),
    assetIdx: index().on(t.assetId),
    accountIdx: index().on(t.account),
  })
);

export const InvestOrderRelations = relations(InvestOrder, ({ one }) => ({
  token: one(Token, {
    fields: [InvestOrder.tokenId],
    references: [Token.id],
  }),
  asset: one(Asset, {
    fields: [InvestOrder.assetId],
    references: [Asset.id],
  }),
}));

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
    poolIdx: index().on(t.poolId),
    tokenIdx: index().on(t.tokenId),
    assetIdx: index().on(t.assetId),
    accountIdx: index().on(t.account),
  })
);

export const RedeemOrderRelations = relations(RedeemOrder, ({ one }) => ({
  token: one(Token, {
    fields: [RedeemOrder.tokenId],
    references: [Token.id],
  }),
  asset: one(Asset, {
    fields: [RedeemOrder.assetId],
    references: [Asset.id],
  }),
}));

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
    poolIdx: index().on(t.poolId),
    tokenIdx: index().on(t.tokenId),
    assetIdx: index().on(t.assetId),
  })
);

export const EpochOutstandingInvestRelations = relations(
  EpochOutstandingInvest,
  ({ one }) => ({
    token: one(Token, {
      fields: [EpochOutstandingInvest.tokenId],
      references: [Token.id],
    }),
    asset: one(Asset, {
      fields: [EpochOutstandingInvest.assetId],
      references: [Asset.id],
    }),
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
    poolIdx: index().on(t.poolId),
    tokenIdx: index().on(t.tokenId),
    assetIdx: index().on(t.assetId),
  })
);

export const EpochOutstandingRedeemRelations = relations(
  EpochOutstandingRedeem,
  ({ one }) => ({
    token: one(Token, {
      fields: [EpochOutstandingRedeem.tokenId],
      references: [Token.id],
    }),
    asset: one(Asset, {
      fields: [EpochOutstandingRedeem.assetId],
      references: [Asset.id],
    }),
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
    poolIdx: index().on(t.poolId),
    tokenIdx: index().on(t.tokenId),
    assetIdx: index().on(t.assetId),
  })
);

export const EpochInvestOrderRelations = relations(
  EpochInvestOrder,
  ({ one }) => ({
    token: one(Token, {
      fields: [EpochInvestOrder.tokenId],
      references: [Token.id],
    }),
    asset: one(Asset, {
      fields: [EpochInvestOrder.assetId],
      references: [Asset.id],
    }),
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
  approvedSharesAmount: t.bigint().default(0n), // asset denomination
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
    poolIdx: index().on(t.poolId),
    tokenIdx: index().on(t.tokenId),
    assetIdx: index().on(t.assetId),
  })
);

export const EpochRedeemOrderRelations = relations(
  EpochRedeemOrder,
  ({ one }) => ({
    token: one(Token, {
      fields: [EpochRedeemOrder.tokenId],
      references: [Token.id],
    }),
    asset: one(Asset, {
      fields: [EpochRedeemOrder.assetId],
      references: [Asset.id],
    }),
  })
);

const AssetRegistrationColumns = (t: PgColumnsBuilders) => ({
  assetId: t.bigint().notNull(),
  centrifugeId: t.text().notNull(),
  ...defaultColumns(t),
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
  centrifugeId: t.text(),
  address: t.hex(),
  assetTokenId: t.bigint(),
  decimals: t.integer().notNull(),
  name: t.text(),
  symbol: t.text(),
  ...defaultColumns(t, false),
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
  isActive: t.boolean().notNull().default(false),
  address: t.hex().notNull(),
  tokenPrice: t.bigint().default(0n),
  computedAt: t.timestamp(),
  totalIssuance: t.bigint().default(0n),
  ...defaultColumns(t),
});
export const TokenInstance = onchainTable(
  "token_instance",
  TokenInstanceColumns,
  (t) => ({
    id: primaryKey({ columns: [t.centrifugeId, t.tokenId] }),
    addressIdx: index().on(t.address),
  })
);
export const TokenInstanceRelations = relations(
  TokenInstance,
  ({ one, many }) => ({
    blockchain: one(Blockchain, {
      fields: [TokenInstance.centrifugeId],
      references: [Blockchain.centrifugeId],
    }),
    token: one(Token, {
      fields: [TokenInstance.tokenId],
      references: [Token.id],
    }),
    vaults: many(Vault, { relationName: "vaults" }),
  })
);

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
  ...defaultColumns(t, false),
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
  ...defaultColumns(t, true),
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
export const HoldingEscrowRelations = relations(HoldingEscrow, ({ one }) => ({
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
}));

const PoolManagerColumns = (t: PgColumnsBuilders) => ({
  address: t.hex().notNull(),
  centrifugeId: t.text().notNull(),
  poolId: t.bigint().notNull(),
  isHubManager: t.boolean().notNull().default(false),
  isBalancesheetManager: t.boolean().notNull().default(false),
});

export const PoolManager = onchainTable(
  "pool_manager",
  PoolManagerColumns,
  (t) => ({
    id: primaryKey({ columns: [t.address, t.centrifugeId, t.poolId] }),
    poolIdx: index().on(t.poolId),
  })
);

export const PoolManagerRelations = relations(PoolManager, ({ one }) => ({
  pool: one(Pool, {
    fields: [PoolManager.poolId],
    references: [Pool.id],
  }),
}));

const OnOffRampManagerColumns = (t: PgColumnsBuilders) => ({
  centrifugeId: t.text().notNull(),
  address: t.hex().notNull(),
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
});

export const OnOffRampManager = onchainTable(
  "on_off_ramp_manager",
  OnOffRampManagerColumns,
  (t) => ({
    id: primaryKey({ columns: [t.address, t.centrifugeId] }),
    tokenIdx: index().on(t.tokenId),
    poolIdx: index().on(t.poolId),
    centrifugeIdIdx: index().on(t.centrifugeId),
  })
);

export const OnOffRampManagerRelations = relations(
  OnOffRampManager,
  ({ one }) => ({
    pool: one(Pool, {
      fields: [OnOffRampManager.poolId],
      references: [Pool.id],
    }),
    token: one(Token, {
      fields: [OnOffRampManager.tokenId],
      references: [Token.id],
    }),
  })
);

const OfframpRelayerColumns = (t: PgColumnsBuilders) => ({
  centrifugeId: t.text().notNull(),
  tokenId: t.text().notNull(),
  poolId: t.bigint().notNull(),
  address: t.hex().notNull(),
  isEnabled: t.boolean().notNull().default(false),
});

export const OfframpRelayer = onchainTable(
  "offramp_relayer",
  OfframpRelayerColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.centrifugeId, t.address] }),
    tokenIdx: index().on(t.tokenId),
    centrifugeIdIdx: index().on(t.centrifugeId),
    addressIdx: index().on(t.address),
  })
);

const OnRampAssetColumns = (t: PgColumnsBuilders) => ({
  poolId: t.bigint().notNull(),
  tokenId: t.text().notNull(),
  centrifugeId: t.text().notNull(),
  assetAddress: t.hex().notNull(),
  isEnabled: t.boolean().notNull().default(false),
});

export const OnRampAsset = onchainTable(
  "on_ramp_asset",
  OnRampAssetColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.centrifugeId, t.assetAddress] }),
    tokenIdx: index().on(t.tokenId),
    assetIdx: index().on(t.assetAddress),
    centrifugeIdIdx: index().on(t.centrifugeId),
  })
);

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
export const OffRampAddress = onchainTable(
  "off_ramp_address",
  OffRampAddressColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.assetAddress, t.receiverAddress] }),
    poolIdx: index().on(t.poolId),
    tokenIdx: index().on(t.tokenId),
    assetIdx: index().on(t.assetAddress),
    receiverIdx: index().on(t.receiverAddress),
  })
);

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
  root: t.hex().notNull(),
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

export const CrosschainPayloadStatuses = [
  "Underpaid",
  "InTransit",
  "Delivered",
  "PartiallyFailed",
  "Completed",
] as const;
export const CrosschainPayloadStatus = onchainEnum(
  "crosschain_payload_status",
  CrosschainPayloadStatuses
);

const CrosschainPayloadColumns = (t: PgColumnsBuilders) => ({
  id: t.hex().notNull(),
  index: t.integer().notNull().default(0),
  fromCentrifugeId: t.text().notNull(),
  toCentrifugeId: t.text().notNull(),
  rawData: t.hex().notNull(),
  poolId: t.bigint(),
  status: CrosschainPayloadStatus("crosschain_payload_status").notNull(),
  deliveredAt: t.timestamp(),
  deliveredAtBlock: t.integer(),
  completedAt: t.timestamp(),
  completedAtBlock: t.integer(),
  prepareTxHash: t.hex().notNull(),
  deliveryTxHash: t.hex(),
  ...defaultColumns(t, false),
});

export const CrosschainPayload = onchainTable(
  "crosschain_payload",
  CrosschainPayloadColumns,
  (t) => ({
    id: primaryKey({ columns: [t.id, t.index] }),
    idIdx: index().on(t.id),
    indexIdx: index().on(t.index),
    poolIdx: index().on(t.id),
    fromCentrifugeIdIdx: index().on(t.fromCentrifugeId),
    toCentrifugeIdIdx: index().on(t.toCentrifugeId),
  })
);

export const CrosschainPayloadRelations = relations(
  CrosschainPayload,
  ({ one, many }) => ({
    fromBlockchain: one(Blockchain, {
      fields: [CrosschainPayload.fromCentrifugeId],
      references: [Blockchain.centrifugeId],
    }),
    toBlockchain: one(Blockchain, {
      fields: [CrosschainPayload.toCentrifugeId],
      references: [Blockchain.centrifugeId],
    }),
    crosschainMessages: many(CrosschainMessage, {
      relationName: "crosschainMessages",
    }),
    pool: one(Pool, {
      fields: [CrosschainPayload.poolId],
      references: [Pool.id],
    }),
    adapterParticipations: many(AdapterParticipation, {
      relationName: "adapterParticipations",
    }),
  })
);

export const CrosschainMessageStatuses = [
  "Unsent",
  "AwaitingBatchDelivery",
  "Failed",
  "Executed",
] as const;
export const CrosschainMessageStatus = onchainEnum(
  "crosschain_message_status",
  CrosschainMessageStatuses
);

const CrosschainMessageColumns = (t: PgColumnsBuilders) => ({
  id: t.hex().notNull(),
  index: t.integer().notNull().default(0),
  poolId: t.bigint(),
  payloadId: t.hex(),
  payloadIndex: t.integer(),
  messageType: t.text().notNull(),
  status: CrosschainMessageStatus("crosschain_message_status").notNull(),
  rawData: t.hex().notNull(),
  data: t.jsonb(),
  failReason: t.hex(),
  fromCentrifugeId: t.text().notNull(),
  toCentrifugeId: t.text().notNull(),
  executedAt: t.timestamp(),
  executedAtBlock: t.integer(),
  executeTxHash: t.hex(),
  ...defaultColumns(t, false),
});

export const CrosschainMessage = onchainTable(
  "crosschain_message",
  CrosschainMessageColumns,
  (t) => ({
    id: primaryKey({ columns: [t.id, t.index] }),
    idIdx: index().on(t.id),
    indexIdx: index().on(t.index),
    payloadIdx: index().on(t.payloadId),
    poolIdx: index().on(t.poolId),
  })
);

export const CrosschainMessageRelations = relations(
  CrosschainMessage,
  ({ one }) => ({
    crosschainPayload: one(CrosschainPayload, {
      fields: [CrosschainMessage.payloadId, CrosschainMessage.payloadIndex],
      references: [CrosschainPayload.id, CrosschainPayload.index],
    }),
    pool: one(Pool, {
      fields: [CrosschainMessage.poolId],
      references: [Pool.id],
    }),
    fromBlockchain: one(Blockchain, {
      fields: [CrosschainMessage.fromCentrifugeId],
      references: [Blockchain.centrifugeId],
    }),
    toBlockchain: one(Blockchain, {
      fields: [CrosschainMessage.toCentrifugeId],
      references: [Blockchain.centrifugeId],
    }),
  })
);

const AdapterColumns = (t: PgColumnsBuilders) => ({
  address: t.hex().notNull(),
  centrifugeId: t.text().notNull(),
  name: t.text(),
  ...defaultColumns(t, false),
});

export const Adapter = onchainTable("adapter", AdapterColumns, (t) => ({
  id: primaryKey({ columns: [t.address, t.centrifugeId] }),
  centrifugeIdIdx: index().on(t.centrifugeId),
  addressIdx: index().on(t.address),
}));

export const AdapterParticipationTypes = ["PAYLOAD", "PROOF"] as const;
export const AdapterParticipationType = onchainEnum(
  "adapter_participation_type",
  AdapterParticipationTypes
);
export const AdapterParticipationSides = ["SEND", "HANDLE"] as const;
export const AdapterParticipationSide = onchainEnum(
  "adapter_participation_side",
  AdapterParticipationSides
);

const AdapterParticipationColumns = (t: PgColumnsBuilders) => ({
  payloadId: t.text().notNull(),
  payloadIndex: t.integer().notNull(),
  adapterId: t.text().notNull(),
  centrifugeId: t.text().notNull(),
  fromCentrifugeId: t.text().notNull(),
  toCentrifugeId: t.text().notNull(),
  type: AdapterParticipationType("adapter_participation_type").notNull(),
  side: AdapterParticipationSide("adapter_participation_side").notNull(),
  timestamp: t.timestamp().notNull(),
  blockNumber: t.integer().notNull(),
  transactionHash: t.text().notNull(),
});

export const AdapterParticipation = onchainTable(
  "adapter_participation",
  AdapterParticipationColumns,
  (t) => ({
    id: primaryKey({
      columns: [t.payloadId, t.payloadIndex, t.adapterId, t.side, t.type],
    }),
    payloadIdIdx: index().on(t.payloadId),
    payloadIndexIdx: index().on(t.payloadIndex),
    adapterIdIdx: index().on(t.adapterId),
    centrifugeIdIdx: index().on(t.centrifugeId),
    fromCentrifugeIdIdx: index().on(t.fromCentrifugeId),
    toCentrifugeIdIdx: index().on(t.toCentrifugeId),
    sideIdx: index().on(t.side),
    typeIdx: index().on(t.type),
  })
);

export const AdapterParticipationRelations = relations(
  AdapterParticipation,
  ({ one }) => ({
    payload: one(CrosschainPayload, {
      fields: [
        AdapterParticipation.payloadId,
        AdapterParticipation.payloadIndex,
      ],
      references: [CrosschainPayload.id, CrosschainPayload.index],
    }),
    adapter: one(Adapter, {
      fields: [
        AdapterParticipation.adapterId,
        AdapterParticipation.centrifugeId,
      ],
      references: [Adapter.address, Adapter.centrifugeId],
    }),
    centrifugeBlockchain: one(Blockchain, {
      fields: [AdapterParticipation.centrifugeId],
      references: [Blockchain.centrifugeId],
    }),
    fromBlockchain: one(Blockchain, {
      fields: [AdapterParticipation.fromCentrifugeId],
      references: [Blockchain.centrifugeId],
    }),
    toBlockchain: one(Blockchain, {
      fields: [AdapterParticipation.toCentrifugeId],
      references: [Blockchain.centrifugeId],
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

export const TokenInstanceSnapshot = onchainTable(
  "token_instance_snapshot",
  snapshotColumns(TokenInstanceColumns, [
    "tokenId",
    "centrifugeId",
    "tokenPrice",
    "totalIssuance",
  ] as const),
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.blockNumber, t.trigger] }),
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

export const HoldingEscrowSnapshot = onchainTable(
  "holding_escrow_snapshot",
  snapshotColumns(HoldingEscrowColumns, [
    "tokenId",
    "assetId",
    "assetAmount",
    "assetPrice",
  ] as const),
  (t) => ({
    id: primaryKey({
      columns: [t.tokenId, t.assetId, t.blockNumber, t.trigger],
    }),
  })
);

const AccountColumns = (t: PgColumnsBuilders) => ({
  address: t.hex().notNull(),
  ...defaultColumns(t, false),
});
export const Account = onchainTable("account", AccountColumns, (t) => ({
  id: primaryKey({ columns: [t.address] }),
  addressIdx: index().on(t.address),
}));
export const AccountRelations = relations(Account, ({}) => ({}));

const TokenInstancePositionColumns = (t: PgColumnsBuilders) => ({
  tokenId: t.text().notNull(),
  centrifugeId: t.text().notNull(),
  accountAddress: t.hex().notNull(),
  balance: t.bigint().notNull().default(0n),
  isFrozen: t.boolean().notNull().default(false), //TODO: Deprecate this column
  ...defaultColumns(t),
});

export const TokenInstancePosition = onchainTable(
  "token_instance_position",
  TokenInstancePositionColumns,
  (t) => ({
    id: primaryKey({ columns: [t.tokenId, t.centrifugeId, t.accountAddress] }),
    tokenIdx: index().on(t.tokenId),
    centrifugeIdIdx: index().on(t.centrifugeId),
    accountIdx: index().on(t.accountAddress),
  })
);

export const TokenInstancePositionRelations = relations(
  TokenInstancePosition,
  ({ one }) => ({
    tokenInstance: one(TokenInstance, {
      fields: [
        TokenInstancePosition.tokenId,
        TokenInstancePosition.centrifugeId,
      ],
      references: [TokenInstance.tokenId, TokenInstance.centrifugeId],
    }),
    account: one(Account, {
      fields: [TokenInstancePosition.accountAddress],
      references: [Account.address],
    }),
  })
);

const MerkleProofManagerColumns = (t: PgColumnsBuilders) => ({
  address: t.hex().notNull(),
  centrifugeId: t.text().notNull(),
  poolId: t.bigint().notNull(),
});
export const MerkleProofManager = onchainTable(
  "merkle_proof_manager",
  MerkleProofManagerColumns,
  (t) => ({
    id: primaryKey({ columns: [t.address, t.centrifugeId] }),
  })
);
export const MerkleProofManagerRelations = relations(
  MerkleProofManager,
  ({ one }) => ({
    pool: one(Pool, {
      fields: [MerkleProofManager.poolId],
      references: [Pool.id],
    }),
  })
);

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

/**
 * Creates a default column definition function with createdAt and updatedAt columns
 * @param t - The PgColumnsBuilders instance
 * @returns A new column definition function with createdAt and updatedAt columns
 */
function defaultColumns(t: PgColumnsBuilders, update = true): DefaultColumns {
  if (update) {
    return {
      createdAt: t.timestamp().notNull(),
      createdAtBlock: t.integer().notNull(),
      updatedAt: t.timestamp().notNull(),
      updatedAtBlock: t.integer().notNull(),
    };
  } else {
    return {
      createdAt: t.timestamp().notNull(),
      createdAtBlock: t.integer().notNull(),
    };
  }
}
type DefaultColumns =
  | {
      createdAt: PgColumn<"timestamp">;
      createdAtBlock: PgColumn<"integer">;
      updatedAt: PgColumn<"timestamp">;
      updatedAtBlock: PgColumn<"integer">;
    }
  | {
      createdAt: PgColumn<"timestamp">;
      createdAtBlock: PgColumn<"integer">;
    };
