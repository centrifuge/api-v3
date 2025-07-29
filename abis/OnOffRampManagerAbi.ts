export const OnOffRampManagerAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "poolId_",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "scId_",
        type: "bytes16",
        internalType: "ShareClassId",
      },
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
    name: "deposit",
    inputs: [
      {
        name: "asset",
        type: "address",
        internalType: "address",
      },
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "amount",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "offramp",
    inputs: [
      {
        name: "asset",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "receiver",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "onramp",
    inputs: [
      {
        name: "asset",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "poolId",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint64",
        internalType: "PoolId",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "relayer",
    inputs: [
      {
        name: "relayer",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "scId",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes16",
        internalType: "ShareClassId",
      },
    ],
    stateMutability: "view",
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
    type: "function",
    name: "supportsInterface",
    inputs: [
      {
        name: "interfaceId",
        type: "bytes4",
        internalType: "bytes4",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "update",
    inputs: [
      {
        name: "poolId_",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "",
        type: "bytes16",
        internalType: "ShareClassId",
      },
      {
        name: "payload",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      {
        name: "asset",
        type: "address",
        internalType: "address",
      },
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "amount",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "receiver",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "UpdateOfframp",
    inputs: [
      {
        name: "asset",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "receiver",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "UpdateOnramp",
    inputs: [
      {
        name: "asset",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "isEnabled",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "UpdateRelayer",
    inputs: [
      {
        name: "relayer",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "isEnabled",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "ERC6909NotSupported",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidAmount",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidOfframpDestination",
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
    name: "NotAllowedOnrampAsset",
    inputs: [],
  },
  {
    type: "error",
    name: "NotRelayer",
    inputs: [],
  },
  {
    type: "error",
    name: "NotSpoke",
    inputs: [],
  },
  {
    type: "error",
    name: "SliceOutOfBounds",
    inputs: [],
  },
  {
    type: "error",
    name: "UnknownMessageType",
    inputs: [],
  },
  {
    type: "error",
    name: "UnknownUpdateContractType",
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
