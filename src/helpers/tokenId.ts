import { Hex } from "viem";

/**
 * Extracts the pool ID from a token ID
 * @param tokenId - The token ID
 * @returns The pool ID
 */
export function poolId(tokenId: Hex): bigint {
  return BigInt(tokenId) >> 64n;
}

/**
 * Extracts the Centrifuge ID from a token ID
 * @param tokenId - The token ID
 * @returns The Centrifuge ID
 */
export function centrifugeId(tokenId: Hex): number {
  return Number(BigInt(tokenId) >> 112n);
}
