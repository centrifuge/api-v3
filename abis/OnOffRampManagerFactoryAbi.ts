export const OnOffRampManagerFactoryAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "spoke_",
        type: "address",
        internalType: "address",
      },
      {
        name: "balanceSheet_",
        type: "address",
        internalType: "contract IBalanceSheet",
      },
    ],
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
    name: "newManager",
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
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IOnOfframpManager",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "spoke",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "DeployOnOfframpManager",
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
        name: "manager",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
] as const;
