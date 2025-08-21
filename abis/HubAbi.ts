export const HubAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "gateway_",
        type: "address",
        internalType: "contract IGateway",
      },
      {
        name: "holdings_",
        type: "address",
        internalType: "contract IHoldings",
      },
      {
        name: "hubHelpers_",
        type: "address",
        internalType: "contract IHubHelpers",
      },
      {
        name: "accounting_",
        type: "address",
        internalType: "contract IAccounting",
      },
      {
        name: "hubRegistry_",
        type: "address",
        internalType: "contract IHubRegistry",
      },
      {
        name: "shareClassManager_",
        type: "address",
        internalType: "contract IShareClassManager",
      },
      {
        name: "deployer",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "accounting",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IAccounting",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "addShareClass",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "name",
        type: "string",
        internalType: "string",
      },
      {
        name: "symbol",
        type: "string",
        internalType: "string",
      },
      {
        name: "salt",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "approveDeposits",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "depositAssetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "nowDepositEpochId",
        type: "uint32",
        internalType: "uint32",
      },
      {
        name: "approvedAssetAmount",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    outputs: [
      {
        name: "pendingAssetAmount",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "approvedPoolAmount",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "approveRedeems",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "payoutAssetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "nowRedeemEpochId",
        type: "uint32",
        internalType: "uint32",
      },
      {
        name: "approvedShareAmount",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    outputs: [
      {
        name: "pendingShareAmount",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "createAccount",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "account",
        type: "uint32",
        internalType: "AccountId",
      },
      {
        name: "isDebitNormal",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "createPool",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "admin",
        type: "address",
        internalType: "address",
      },
      {
        name: "currency",
        type: "uint128",
        internalType: "AssetId",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "deny",
    inputs: [
      {
        name: "user",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "file",
    inputs: [
      {
        name: "what",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "data",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "forceCancelDepositRequest",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "investor",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "depositAssetId",
        type: "uint128",
        internalType: "AssetId",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "forceCancelRedeemRequest",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "investor",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "payoutAssetId",
        type: "uint128",
        internalType: "AssetId",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "gateway",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IGateway",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "holdings",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IHoldings",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hubHelpers",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IHubHelpers",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hubRegistry",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IHubRegistry",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "initializeHolding",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "valuation",
        type: "address",
        internalType: "contract IValuation",
      },
      {
        name: "assetAccount",
        type: "uint32",
        internalType: "AccountId",
      },
      {
        name: "equityAccount",
        type: "uint32",
        internalType: "AccountId",
      },
      {
        name: "gainAccount",
        type: "uint32",
        internalType: "AccountId",
      },
      {
        name: "lossAccount",
        type: "uint32",
        internalType: "AccountId",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "initializeLiability",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "valuation",
        type: "address",
        internalType: "contract IValuation",
      },
      {
        name: "expenseAccount",
        type: "uint32",
        internalType: "AccountId",
      },
      {
        name: "liabilityAccount",
        type: "uint32",
        internalType: "AccountId",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "initiateTransferShares",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "receiver",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "amount",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "extraGasLimit",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "issueShares",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "depositAssetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "nowIssueEpochId",
        type: "uint32",
        internalType: "uint32",
      },
      {
        name: "navPoolPerShare",
        type: "uint128",
        internalType: "D18",
      },
      {
        name: "extraGasLimit",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    outputs: [
      {
        name: "issuedShareAmount",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "depositAssetAmount",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "depositPoolAmount",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "multicall",
    inputs: [
      {
        name: "data",
        type: "bytes[]",
        internalType: "bytes[]",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "notifyAssetPrice",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "notifyDeposit",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "investor",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "maxClaims",
        type: "uint32",
        internalType: "uint32",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "notifyPool",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "notifyRedeem",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "investor",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "maxClaims",
        type: "uint32",
        internalType: "uint32",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "notifyShareClass",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "hook",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "notifyShareMetadata",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "notifySharePrice",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "poolEscrowFactory",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IPoolEscrowFactory",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "recoverTokens",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address",
      },
      {
        name: "receiver",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "recoverTokens",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "receiver",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "registerAsset",
    inputs: [
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "decimals",
        type: "uint8",
        internalType: "uint8",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rely",
    inputs: [
      {
        name: "user",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "request",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "payload",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "revokeShares",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "payoutAssetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "nowRevokeEpochId",
        type: "uint32",
        internalType: "uint32",
      },
      {
        name: "navPoolPerShare",
        type: "uint128",
        internalType: "D18",
      },
      {
        name: "extraGasLimit",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    outputs: [
      {
        name: "revokedShareAmount",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "payoutAssetAmount",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "payoutPoolAmount",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "sender",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IHubMessageSender",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setAccountMetadata",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "account",
        type: "uint32",
        internalType: "AccountId",
      },
      {
        name: "metadata",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "setHoldingAccountId",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "kind",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "accountId",
        type: "uint32",
        internalType: "AccountId",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "setMaxAssetPriceAge",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "maxPriceAge",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "setMaxSharePriceAge",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "maxPriceAge",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "setPoolMetadata",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "metadata",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "setRequestManager",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "manager",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "setSnapshotHook",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "hook",
        type: "address",
        internalType: "contract ISnapshotHook",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "shareClassManager",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IShareClassManager",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "updateBalanceSheetManager",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "who",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "canManage",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "updateContract",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "target",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "payload",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "extraGasLimit",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "updateHoldingAmount",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "amount",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "pricePoolPerAsset",
        type: "uint128",
        internalType: "D18",
      },
      {
        name: "isIncrease",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "isSnapshot",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "nonce",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateHoldingIsLiability",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "isLiability",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "updateHoldingValuation",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "valuation",
        type: "address",
        internalType: "contract IValuation",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "updateHoldingValue",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "updateHubManager",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "who",
        type: "address",
        internalType: "address",
      },
      {
        name: "canManage",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "updateJournal",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "debits",
        type: "tuple[]",
        internalType: "struct JournalEntry[]",
        components: [
          {
            name: "value",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "accountId",
            type: "uint32",
            internalType: "AccountId",
          },
        ],
      },
      {
        name: "credits",
        type: "tuple[]",
        internalType: "struct JournalEntry[]",
        components: [
          {
            name: "value",
            type: "uint128",
            internalType: "uint128",
          },
          {
            name: "accountId",
            type: "uint32",
            internalType: "AccountId",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateRestriction",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "payload",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "extraGasLimit",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "updateShareClassMetadata",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "name",
        type: "string",
        internalType: "string",
      },
      {
        name: "symbol",
        type: "string",
        internalType: "string",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "updateShareHook",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "hook",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "updateSharePrice",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "navPoolPerShare",
        type: "uint128",
        internalType: "D18",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "updateShares",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "amount",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "isIssuance",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "isSnapshot",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "nonce",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateVault",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        internalType: "AssetId",
      },
      {
        name: "vaultOrFactory",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "kind",
        type: "uint8",
        internalType: "enum VaultUpdateKind",
      },
      {
        name: "extraGasLimit",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "wards",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Deny",
    inputs: [
      {
        name: "user",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "File",
    inputs: [
      {
        name: "what",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "addr",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ForwardTransferShares",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        indexed: false,
        internalType: "ShareClassId",
      },
      {
        name: "receiver",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "amount",
        type: "uint128",
        indexed: false,
        internalType: "uint128",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "NotifyAssetPrice",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        indexed: false,
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        indexed: false,
        internalType: "AssetId",
      },
      {
        name: "pricePoolPerAsset",
        type: "uint128",
        indexed: false,
        internalType: "D18",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "NotifyPool",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "NotifyShareClass",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        indexed: false,
        internalType: "ShareClassId",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "NotifyShareMetadata",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        indexed: false,
        internalType: "ShareClassId",
      },
      {
        name: "name",
        type: "string",
        indexed: false,
        internalType: "string",
      },
      {
        name: "symbol",
        type: "string",
        indexed: false,
        internalType: "string",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "NotifySharePrice",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        indexed: false,
        internalType: "ShareClassId",
      },
      {
        name: "poolPerShare",
        type: "uint128",
        indexed: false,
        internalType: "D18",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Rely",
    inputs: [
      {
        name: "user",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetMaxAssetPriceAge",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        indexed: false,
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        indexed: false,
        internalType: "AssetId",
      },
      {
        name: "maxPriceAge",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetMaxSharePriceAge",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        indexed: false,
        internalType: "ShareClassId",
      },
      {
        name: "maxPriceAge",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "UpdateContract",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        indexed: false,
        internalType: "ShareClassId",
      },
      {
        name: "target",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "payload",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "UpdateRestriction",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        indexed: false,
        internalType: "ShareClassId",
      },
      {
        name: "payload",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "UpdateShareHook",
    inputs: [
      {
        name: "centrifugeId",
        type: "uint16",
        indexed: true,
        internalType: "uint16",
      },
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        indexed: false,
        internalType: "ShareClassId",
      },
      {
        name: "hook",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "UpdateVault",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
      },
      {
        name: "scId",
        type: "bytes16",
        indexed: false,
        internalType: "ShareClassId",
      },
      {
        name: "assetId",
        type: "uint128",
        indexed: false,
        internalType: "AssetId",
      },
      {
        name: "vaultOrFactory",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "kind",
        type: "uint8",
        indexed: false,
        internalType: "enum VaultUpdateKind",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "AccountDoesNotExist",
    inputs: [],
  },
  {
    type: "error",
    name: "AssetNotFound",
    inputs: [],
  },
  {
    type: "error",
    name: "CallFailedWithEmptyRevert",
    inputs: [],
  },
  {
    type: "error",
    name: "FileUnrecognizedParam",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidAccountCombination",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidPoolId",
    inputs: [],
  },
  {
    type: "error",
    name: "NoCode",
    inputs: [],
  },
  {
    type: "error",
    name: "NotAuthorized",
    inputs: [],
  },
  {
    type: "error",
    name: "NotManager",
    inputs: [],
  },
  {
    type: "error",
    name: "PoolAlreadyUnlocked",
    inputs: [],
  },
  {
    type: "error",
    name: "SafeTransferEthFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "ShareClassNotFound",
    inputs: [],
  },
  {
    type: "error",
    name: "UnauthorizedSender",
    inputs: [],
  },
  {
    type: "error",
    name: "WrappedError",
    inputs: [
      {
        name: "target",
        type: "address",
        internalType: "address",
      },
      {
        name: "selector",
        type: "bytes4",
        internalType: "bytes4",
      },
      {
        name: "reason",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "details",
        type: "bytes",
        internalType: "bytes",
      },
    ],
  },
] as const;
