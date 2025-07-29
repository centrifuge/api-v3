export const MerkleProofManagerFactoryAbi = [
  {
    type: "constructor",
    inputs: [
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
    name: "newManager",
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
        internalType: "contract IMerkleProofManager",
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
    name: "DeployMerkleProofManager",
    inputs: [
      {
        name: "poolId",
        type: "uint64",
        indexed: true,
        internalType: "PoolId",
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
