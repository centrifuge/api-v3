import { Abi } from "viem";

/**
 * Minimal sUSDS (Sky Savings USDS) ABI: `File` governance events for SSR changes plus the
 * `ssr` accumulator getter used to seed the initial rate.
 */
export const SUSDSAbi = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "what", type: "bytes32" },
      { indexed: false, internalType: "uint256", name: "data", type: "uint256" },
    ],
    name: "File",
    type: "event",
  },
  {
    inputs: [],
    name: "ssr",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const satisfies Abi;
