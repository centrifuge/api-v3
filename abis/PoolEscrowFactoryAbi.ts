export const PoolEscrowFactoryAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "root_",
        type: "address",
        internalType: "address",
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
    name: "balanceSheet",
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
    name: "escrow",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
    ],
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
    name: "gateway",
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
    name: "newEscrow",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        internalType: "PoolId",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IPoolEscrow",
      },
    ],
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
    name: "root",
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
    name: "DeployPoolEscrow",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
      },
      {
        name: "escrow",
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
    type: "error",
    name: "EscrowAlreadyDeployed",
    inputs: [],
  },
  {
    type: "error",
    name: "FileUnrecognizedParam",
    inputs: [],
  },
  {
    type: "error",
    name: "NotAuthorized",
    inputs: [],
  },
] as const;
