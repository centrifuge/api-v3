import type { Address } from "viem";
import { networkNames } from "../chains";
import { getContractAddressesForChain, REGISTRY_VERSION_ORDER } from "../contracts";

/**
 * In-memory, chain-scoped registry of protocol-owned addresses.
 *
 * Used by {@link ./userAccount.ts | `isUserAccount`} (and any future per-user
 * performance calculation) to filter out addresses we don't want to track as
 * investor positions: every named protocol contract from the static registry,
 * plus factory-deployed instances (PoolEscrows, Vaults) and any other
 * Auth-mixin contract registered through the ward graph.
 *
 * The Set is seeded at module import from the bundled `generated/` registry
 * and extended at index time by deployment / rely-deny handlers. Lookups are
 * pure in-memory (no RPC, no DB) so the filter is safe to call in hot paths.
 */
const protocolAddressesByChain = new Map<number, Set<string>>();

/** Returns the address Set for `chainId`, creating an empty one on first access. */
function ensureSet(chainId: number): Set<string> {
  let set = protocolAddressesByChain.get(chainId);
  if (!set) {
    set = new Set();
    protocolAddressesByChain.set(chainId, set);
  }
  return set;
}

/** Populates the per-chain Sets with every named contract address from the bundled registry, across all versions. */
function seedFromRegistry(): void {
  const chainIds = Object.keys(networkNames).map((id) => Number(id));
  for (const chainId of chainIds) {
    if (!Number.isFinite(chainId)) continue;
    for (let v = 0; v < REGISTRY_VERSION_ORDER.length; v += 1) {
      const addresses = getContractAddressesForChain(chainId, v);
      if (!addresses) continue;
      const set = ensureSet(chainId);
      for (const addr of Object.values(addresses)) {
        set.add(addr.toLowerCase());
      }
    }
  }
}

seedFromRegistry();

/**
 * Marks an address as protocol-owned for the given chain. Idempotent.
 *
 * Call from deployment / rely-deny handlers immediately after the existing
 * service writes so that any factory-deployed protocol contract (PoolEscrow,
 * Vault, ward-graph participant) is filtered out by `isUserAccount` for every
 * subsequent event in the same indexer run.
 */
export function registerProtocolAddress(chainId: number, address: Address): void {
  ensureSet(chainId).add(address.toLowerCase());
}

/**
 * Returns true if the address has been seeded from the static registry or
 * registered via {@link registerProtocolAddress} for the given chain.
 */
export function isProtocolAddress(chainId: number, address: Address): boolean {
  return ensureSet(chainId).has(address.toLowerCase());
}
