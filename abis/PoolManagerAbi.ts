export const PoolManagerAbi = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint64", name: "poolId", type: "uint64" },
      {
        indexed: true,
        internalType: "bytes16",
        name: "trancheId",
        type: "bytes16",
      },
      {
        indexed: true,
        internalType: "address",
        name: "token",
        type: "address",
      },
    ],
    name: "DeployTranche",
    type: "event",
  },
] as const;
