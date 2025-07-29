export const MerkleProofManagerAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "poolId_",
        type: "uint64",
        internalType: "PoolId",
      },
      {
        name: "spoke_",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "execute",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        internalType: "struct Call[]",
        components: [
          {
            name: "decoder",
            type: "address",
            internalType: "address",
          },
          {
            name: "target",
            type: "address",
            internalType: "address",
          },
          {
            name: "targetData",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "value",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "proof",
            type: "bytes32[]",
            internalType: "bytes32[]",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "policy",
    inputs: [
      {
        name: "strategist",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "root",
        type: "bytes32",
        internalType: "bytes32",
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
    type: "event",
    name: "ExecuteCall",
    inputs: [
      {
        name: "target",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "selector",
        type: "bytes4",
        indexed: true,
        internalType: "bytes4",
      },
      {
        name: "targetData",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
      {
        name: "value",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "UpdatePolicy",
    inputs: [
      {
        name: "strategist",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "oldRoot",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "newRoot",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "CallFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "DecodingFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "InsufficientBalance",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidDecodersLength",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidPoolId",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidProof",
    inputs: [
      {
        name: "leaf",
        type: "tuple",
        internalType: "struct PolicyLeaf",
        components: [
          {
            name: "decoder",
            type: "address",
            internalType: "address",
          },
          {
            name: "target",
            type: "address",
            internalType: "address",
          },
          {
            name: "valueNonZero",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "selector",
            type: "bytes4",
            internalType: "bytes4",
          },
          {
            name: "addresses",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
      {
        name: "proof",
        type: "bytes32[]",
        internalType: "bytes32[]",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidProofLength",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidTargetDataLength",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidValuesLength",
    inputs: [],
  },
  {
    type: "error",
    name: "NotAStrategist",
    inputs: [],
  },
  {
    type: "error",
    name: "NotAuthorized",
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
