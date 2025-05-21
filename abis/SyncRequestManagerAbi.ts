export const SyncRequestManagerAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "globalEscrow_",
        type: "address",
        internalType: "contract IEscrow",
      },
      { name: "root_", type: "address", internalType: "address" },
      { name: "deployer", type: "address", internalType: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addVault",
    inputs: [
      { name: "poolId", type: "uint64", internalType: "PoolId" },
      { name: "scId", type: "bytes16", internalType: "ShareClassId" },
      {
        name: "vault_",
        type: "address",
        internalType: "contract IBaseVault",
      },
      { name: "asset_", type: "address", internalType: "address" },
      { name: "assetId", type: "uint128", internalType: "AssetId" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceSheet",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IBalanceSheet",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "convertToAssets",
    inputs: [
      {
        name: "vault_",
        type: "address",
        internalType: "contract IBaseVault",
      },
      { name: "shares", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "assets", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "convertToShares",
    inputs: [
      {
        name: "vault_",
        type: "address",
        internalType: "contract IBaseVault",
      },
      { name: "assets", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "deny",
    inputs: [{ name: "user", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "deposit",
    inputs: [
      {
        name: "vault_",
        type: "address",
        internalType: "contract IBaseVault",
      },
      { name: "assets", type: "uint256", internalType: "uint256" },
      { name: "receiver", type: "address", internalType: "address" },
      { name: "owner", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "file",
    inputs: [
      { name: "what", type: "bytes32", internalType: "bytes32" },
      { name: "data", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "globalEscrow",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract IEscrow" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "maxDeposit",
    inputs: [
      {
        name: "vault_",
        type: "address",
        internalType: "contract IBaseVault",
      },
      { name: "", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "maxMint",
    inputs: [
      {
        name: "vault_",
        type: "address",
        internalType: "contract IBaseVault",
      },
      { name: "", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "maxReserve",
    inputs: [
      { name: "", type: "uint64", internalType: "PoolId" },
      { name: "scId", type: "bytes16", internalType: "ShareClassId" },
      { name: "asset", type: "address", internalType: "address" },
      { name: "tokenId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "uint128", internalType: "uint128" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "mint",
    inputs: [
      {
        name: "vault_",
        type: "address",
        internalType: "contract IBaseVault",
      },
      { name: "shares", type: "uint256", internalType: "uint256" },
      { name: "receiver", type: "address", internalType: "address" },
      { name: "owner", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "assets", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "poolEscrow",
    inputs: [{ name: "poolId", type: "uint64", internalType: "PoolId" }],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IPoolEscrow",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "poolEscrowProvider",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IPoolEscrowProvider",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "poolManager",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IPoolManager",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "previewDeposit",
    inputs: [
      {
        name: "vault_",
        type: "address",
        internalType: "contract IBaseVault",
      },
      { name: "", type: "address", internalType: "address" },
      { name: "assets", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "previewMint",
    inputs: [
      {
        name: "vault_",
        type: "address",
        internalType: "contract IBaseVault",
      },
      { name: "", type: "address", internalType: "address" },
      { name: "shares", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "assets", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "priceLastUpdated",
    inputs: [
      {
        name: "vault_",
        type: "address",
        internalType: "contract IBaseVault",
      },
    ],
    outputs: [{ name: "lastUpdated", type: "uint64", internalType: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "pricePoolPerShare",
    inputs: [
      { name: "poolId", type: "uint64", internalType: "PoolId" },
      { name: "scId", type: "bytes16", internalType: "ShareClassId" },
    ],
    outputs: [{ name: "price", type: "uint128", internalType: "D18" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "prices",
    inputs: [
      { name: "poolId", type: "uint64", internalType: "PoolId" },
      { name: "scId", type: "bytes16", internalType: "ShareClassId" },
      { name: "assetId", type: "uint128", internalType: "AssetId" },
    ],
    outputs: [
      {
        name: "priceData",
        type: "tuple",
        internalType: "struct Prices",
        components: [
          {
            name: "assetPerShare",
            type: "uint128",
            internalType: "D18",
          },
          {
            name: "poolPerAsset",
            type: "uint128",
            internalType: "D18",
          },
          { name: "poolPerShare", type: "uint128", internalType: "D18" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "recoverTokens",
    inputs: [
      { name: "token", type: "address", internalType: "address" },
      { name: "receiver", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "recoverTokens",
    inputs: [
      { name: "token", type: "address", internalType: "address" },
      { name: "tokenId", type: "uint256", internalType: "uint256" },
      { name: "receiver", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rely",
    inputs: [{ name: "user", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "removeVault",
    inputs: [
      { name: "poolId", type: "uint64", internalType: "PoolId" },
      { name: "scId", type: "bytes16", internalType: "ShareClassId" },
      {
        name: "vault_",
        type: "address",
        internalType: "contract IBaseVault",
      },
      { name: "asset_", type: "address", internalType: "address" },
      { name: "assetId", type: "uint128", internalType: "AssetId" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "root",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setMaxReserve",
    inputs: [
      { name: "poolId", type: "uint64", internalType: "PoolId" },
      { name: "scId", type: "bytes16", internalType: "ShareClassId" },
      { name: "asset", type: "address", internalType: "address" },
      { name: "tokenId", type: "uint256", internalType: "uint256" },
      { name: "maxReserve_", type: "uint128", internalType: "uint128" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setValuation",
    inputs: [
      { name: "poolId", type: "uint64", internalType: "PoolId" },
      { name: "scId", type: "bytes16", internalType: "ShareClassId" },
      { name: "valuation_", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "update",
    inputs: [
      { name: "poolId", type: "uint64", internalType: "PoolId" },
      { name: "scId", type: "bytes16", internalType: "ShareClassId" },
      { name: "payload", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "valuation",
    inputs: [
      { name: "", type: "uint64", internalType: "PoolId" },
      { name: "scId", type: "bytes16", internalType: "ShareClassId" },
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract ISyncDepositValuation",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "vault",
    inputs: [
      { name: "", type: "uint64", internalType: "PoolId" },
      { name: "scId", type: "bytes16", internalType: "ShareClassId" },
      { name: "assetId", type: "uint128", internalType: "AssetId" },
    ],
    outputs: [
      { name: "", type: "address", internalType: "contract IBaseVault" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "vaultByAssetId",
    inputs: [
      { name: "poolId", type: "uint64", internalType: "PoolId" },
      { name: "scId", type: "bytes16", internalType: "ShareClassId" },
      { name: "assetId", type: "uint128", internalType: "AssetId" },
    ],
    outputs: [
      { name: "", type: "address", internalType: "contract IBaseVault" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "vaultKind",
    inputs: [
      {
        name: "vault_",
        type: "address",
        internalType: "contract IBaseVault",
      },
    ],
    outputs: [
      { name: "", type: "uint8", internalType: "enum VaultKind" },
      { name: "", type: "address", internalType: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "wards",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
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
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "data",
        type: "address",
        indexed: false,
        internalType: "address",
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
    name: "SetMaxReserve",
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
        indexed: true,
        internalType: "ShareClassId",
      },
      {
        name: "asset",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "maxReserve",
        type: "uint128",
        indexed: false,
        internalType: "uint128",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SetValuation",
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
        indexed: true,
        internalType: "ShareClassId",
      },
      {
        name: "valuation",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  { type: "error", name: "AssetMismatch", inputs: [] },
  { type: "error", name: "AssetNotAllowed", inputs: [] },
  { type: "error", name: "ExceedsMaxDeposit", inputs: [] },
  { type: "error", name: "ExceedsMaxMint", inputs: [] },
  { type: "error", name: "FileUnrecognizedParam", inputs: [] },
  { type: "error", name: "MulDiv_Overflow", inputs: [] },
  { type: "error", name: "NoCode", inputs: [] },
  { type: "error", name: "NotAuthorized", inputs: [] },
  { type: "error", name: "SafeTransferEthFailed", inputs: [] },
  { type: "error", name: "SafeTransferFailed", inputs: [] },
  { type: "error", name: "SenderNotVault", inputs: [] },
  { type: "error", name: "ShareTokenDoesNotExist", inputs: [] },
  { type: "error", name: "SliceOutOfBounds", inputs: [] },
  { type: "error", name: "Uint128_Overflow", inputs: [] },
  { type: "error", name: "UnknownMessageType", inputs: [] },
  { type: "error", name: "UnknownUpdateContractType", inputs: [] },
  { type: "error", name: "VaultAlreadyExists", inputs: [] },
  { type: "error", name: "VaultDoesNotExist", inputs: [] },
] as const;
