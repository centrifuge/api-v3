export const AsyncVaultFactoryAbi = [
  {
    inputs: [
      { internalType: "address", name: "root_", type: "address" },
      {
        internalType: "contract IAsyncRequestManager",
        name: "asyncRequestManager_",
        type: "address",
      },
      { internalType: "address", name: "deployer", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  { inputs: [], name: "NotAuthorized", type: "error" },
  { inputs: [], name: "UnsupportedTokenId", type: "error" },
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
      { indexed: true, internalType: "address", name: "user", type: "address" },
    ],
    name: "Rely",
    type: "event",
  },
  {
    inputs: [],
    name: "asyncRequestManager",
    outputs: [
      {
        internalType: "contract IAsyncRequestManager",
        name: "",
        type: "address",
      },
    ],
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
    inputs: [
      { internalType: "PoolId", name: "poolId", type: "uint64" },
      { internalType: "ShareClassId", name: "scId", type: "bytes16" },
      { internalType: "address", name: "asset", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "contract IShareToken", name: "token", type: "address" },
      { internalType: "address[]", name: "wards_", type: "address[]" },
    ],
    name: "newVault",
    outputs: [
      { internalType: "contract IBaseVault", name: "", type: "address" },
    ],
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
    inputs: [],
    name: "root",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
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
