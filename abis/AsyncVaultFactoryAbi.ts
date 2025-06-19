export const AsyncVaultFactoryAbi = [
  {
    type: "constructor",
    inputs: [
      { name: "root_", type: "address", internalType: "address" },
      {
        name: "asyncRequestManager_",
        type: "address",
        internalType: "contract IAsyncRequestManager",
      },
      { name: "deployer", type: "address", internalType: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "asyncRequestManager",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IAsyncRequestManager",
      },
    ],
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
    name: "newVault",
    inputs: [
      { name: "poolId", type: "uint64", internalType: "PoolId" },
      { name: "scId", type: "bytes16", internalType: "ShareClassId" },
      { name: "asset", type: "address", internalType: "address" },
      { name: "tokenId", type: "uint256", internalType: "uint256" },
      {
        name: "token",
        type: "address",
        internalType: "contract IShareToken",
      },
      { name: "wards_", type: "address[]", internalType: "address[]" },
    ],
    outputs: [{ name: "", type: "address", internalType: "contract IVault" }],
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
    name: "root",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
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
  { type: "error", name: "NotAuthorized", inputs: [] },
  { type: "error", name: "UnsupportedTokenId", inputs: [] },
] as const;
