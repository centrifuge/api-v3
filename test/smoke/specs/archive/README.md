# Archived smoke specs

These were **removed from the core suite** to avoid digital tautology: tests that either (a) only validate sampled indexed rows without completeness, (b) compare fields the indexer does not mirror, or (c) depend on event-derived semantics with no single authoritative on-chain view.

Do not implement unless requirements change. See [../README.md](../README.md) for the 10 core smokes.

| Spec | Reason archived |
|------|-----------------|
| [pool-active.md](./pool-active.md) | Wrong field: `Pool.isActive` ≠ `Spoke.isPoolActive`. Replaced by [pool-spoke-presence.md](../pool-spoke-presence.md). |
| [asset-registration.md](./asset-registration.md) | Merged into [asset.md](../asset.md). |
| [token-metadata.md](./token-metadata.md) | String/IPFS brittleness; low integrity signal. |
| [token-price-hub.md](./token-price-hub.md) | Cross-chain price lag; not a stable smoke. |
| [offramp.md](./offramp.md) | Receivers not chain-enumerable; sampled correctness only. |
| [pool-manager.md](./pool-manager.md) | No ward-style enumeration; sampled edges. |
| [ward.md](./ward.md) | No on-chain list of all wards. |
| [position-balance.md](./position-balance.md) | Large domain; sampling ≠ integrity proof. |
| [holding-escrow.md](./holding-escrow.md) | Escrow total vs indexer amount semantics may diverge. |
| [holding-hub.md](./holding-hub.md) | Valuation/event accounting vs `Holdings` views. |
| [vault-orders.md](./vault-orders.md) | Vault resolution ambiguity; volatile async state. |
| [vault-redeem-orders.md](./vault-redeem-orders.md) | Same as vault-orders. |
| [batch-pending.md](./batch-pending.md) | Per-investor hub orders; bytes32 encoding + lag. |
| [batch-outstanding.md](./batch-outstanding.md) | Queued totals may lack on-chain view. |
| [whitelist.md](./whitelist.md) | Hook type variance; migration seeds. |
| [sync-max-reserve.md](./sync-max-reserve.md) | Narrow population; low priority. |
| [merkle-manager.md](./merkle-manager.md) | Trivial `poolId()` only. |
| [holding-escrow-snapshots.md](./holding-escrow-snapshots.md) | Historical; fragile across upgrades. |
