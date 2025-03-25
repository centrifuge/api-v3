export const PoolRegistryAbi = [
  {
    inputs: [{ internalType: "address", name: "deployer", type: "address" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  { inputs: [], name: "EmptyAdmin", type: "error" },
  { inputs: [], name: "EmptyCurrency", type: "error" },
  { inputs: [], name: "EmptyShareClassManager", type: "error" },
  {
    inputs: [{ internalType: "PoolId", name: "id", type: "uint64" }],
    name: "NonExistingPool",
    type: "error",
  },
  { inputs: [], name: "NotAuthorized", type: "error" },
  { inputs: [], name: "Uint32_Overflow", type: "error" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "user", type: "address" },
    ],
    name: "Deny",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "PoolId",
        name: "poolId",
        type: "uint64",
      },
      {
        indexed: true,
        internalType: "address",
        name: "admin",
        type: "address",
      },
      {
        indexed: true,
        internalType: "contract IShareClassManager",
        name: "shareClassManager",
        type: "address",
      },
      {
        indexed: true,
        internalType: "AssetId",
        name: "currency",
        type: "uint128",
      },
    ],
    name: "NewPool",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "user", type: "address" },
    ],
    name: "Rely",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "PoolId", name: "poolId", type: "uint64" },
      {
        indexed: false,
        internalType: "bytes",
        name: "metadata",
        type: "bytes",
      },
    ],
    name: "SetMetadata",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "PoolId", name: "poolId", type: "uint64" },
      {
        indexed: true,
        internalType: "address",
        name: "admin",
        type: "address",
      },
      { indexed: false, internalType: "bool", name: "canManage", type: "bool" },
    ],
    name: "UpdatedAdmin",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "PoolId", name: "poolId", type: "uint64" },
      {
        indexed: false,
        internalType: "AssetId",
        name: "currency",
        type: "uint128",
      },
    ],
    name: "UpdatedCurrency",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "PoolId", name: "poolId", type: "uint64" },
      {
        indexed: true,
        internalType: "contract IShareClassManager",
        name: "shareClassManager",
        type: "address",
      },
    ],
    name: "UpdatedShareClassManager",
    type: "event",
  },
  {
    inputs: [{ internalType: "PoolId", name: "", type: "uint64" }],
    name: "currency",
    outputs: [{ internalType: "AssetId", name: "", type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "deny",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "PoolId", name: "poolId", type: "uint64" }],
    name: "exists",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "PoolId", name: "", type: "uint64" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "isAdmin",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "latestId",
    outputs: [{ internalType: "uint32", name: "", type: "uint32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "PoolId", name: "", type: "uint64" }],
    name: "metadata",
    outputs: [{ internalType: "bytes", name: "", type: "bytes" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "admin_", type: "address" },
      { internalType: "AssetId", name: "currency_", type: "uint128" },
      {
        internalType: "contract IShareClassManager",
        name: "shareClassManager_",
        type: "address",
      },
    ],
    name: "registerPool",
    outputs: [{ internalType: "PoolId", name: "poolId", type: "uint64" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "rely",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "PoolId", name: "poolId", type: "uint64" },
      { internalType: "bytes", name: "metadata_", type: "bytes" },
    ],
    name: "setMetadata",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "PoolId", name: "", type: "uint64" }],
    name: "shareClassManager",
    outputs: [
      {
        internalType: "contract IShareClassManager",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "PoolId", name: "poolId", type: "uint64" },
      { internalType: "address", name: "admin_", type: "address" },
      { internalType: "bool", name: "canManage", type: "bool" },
    ],
    name: "updateAdmin",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "PoolId", name: "poolId", type: "uint64" },
      { internalType: "AssetId", name: "currency_", type: "uint128" },
    ],
    name: "updateCurrency",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "PoolId", name: "poolId", type: "uint64" },
      {
        internalType: "contract IShareClassManager",
        name: "shareClassManager_",
        type: "address",
      },
    ],
    name: "updateShareClassManager",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "wards",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
