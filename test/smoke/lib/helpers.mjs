import { ContractFunctionRevertedError } from "viem";

/** Label when a hub/spoke view reverts because the entity is not registered on-chain. */
export const ONCHAIN_NOT_FOUND = "AssetNotFound";

/**
 * @param {unknown} err
 */
export function isContractRevert(err) {
  return err instanceof ContractFunctionRevertedError;
}

/**
 * @param {() => Promise<T>} fn
 * @template T
 * @returns {Promise<{ ok: true; value: T } | { ok: false; revert: true } | { ok: false; revert: false }>}
 */
export async function tryReadContract(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (isContractRevert(err)) return { ok: false, revert: true };
    return { ok: false, revert: false };
  }
}

/**
 * @param {Array<T>} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} fn
 * @template T, R
 */
export async function mapPool(items, concurrency, fn) {
  /** @type {R[]} */
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  }
  const workers = Math.min(Math.max(1, concurrency), items.length || 1);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} batchSize
 * @param {(item: T) => Promise<void>} fn
 */
export async function forEachBatch(items, batchSize, fn) {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
  }
}

/**
 * @param {bigint | number | string} poolId
 */
export function poolIdArg(poolId) {
  return BigInt(poolId);
}

/**
 * Encode address as bytes32 investor for batch manager.
 * @param {string} address
 */
export function addressToBytes32(address) {
  const hex = address.toLowerCase().replace(/^0x/, "");
  return `0x${hex.padStart(64, "0")}`;
}
