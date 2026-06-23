import type { Address } from "viem";
import { isProtocolAddress } from "./protocolAddresses";

/**
 * Returns `true` iff `address` should be tracked as a per-user position holder
 * on `chainId`. Excludes the null address and protocol-owned addresses
 * (Centrifuge contracts, ward-graph participants, and seeded DeFi contracts).
 *
 * Pure in-memory lookup: no RPC, no DB. Safe to call from hot handlers and
 * intended for reuse by any per-user performance calculation that needs the
 * same notion of "user".
 *
 * NOTE: investor Safes (and other smart wallets that don't participate in the
 * ward graph) are intentionally classified as user accounts. Their first
 * checkpoint will use bootstrap cost basis at the observation price.
 * TODO: subscribe to `SafeProxyFactory.ProxyCreation` and exclude Safes here
 * once that subscription lands.
 */
export function isUserAccount(chainId: number, address: Address): boolean {
  if (BigInt(address) === 0n) return false;
  return !isProtocolAddress(chainId, address);
}
