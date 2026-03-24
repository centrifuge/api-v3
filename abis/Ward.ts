export const WardAbi = [
  {
    anonymous: false,
    inputs: [{ indexed: true, name: "user", type: "address" }],
    name: "Rely",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, name: "user", type: "address" }],
    name: "Deny",
    type: "event",
  },
] as const;
