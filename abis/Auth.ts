/**
 * Rely/Deny events from the protocol's Auth base contract.
 *
 * Kept as a local fragment (instead of referencing the registry "ShareToken" ABI) because the
 * published v3.1 registry dropped the ShareToken ABI in June 2026, which silently disabled
 * Rely/Deny indexing on share tokens (see ponder.config.ts tokenInstanceV3_1). Event signatures
 * are stable across Auth-derived contracts, so a registry-independent copy is safe.
 */
export const AuthAbi = [
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
] as const;
