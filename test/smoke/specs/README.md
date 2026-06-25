# Smoke test specifications

Few **high-signal** integrity checks: each smoke uses simple, authoritative on-chain views and tests something the indexer does not trivially restate.

## Design principles

1. **One call, one truth** — avoid comparing indexer-derived aggregates to different on-chain aggregates (holdings, orders, PnL).
2. **Correctness vs completeness** — label each smoke; completeness requires chain-driven enumeration or counts, not sampled GraphQL pagination.
3. **No digital tautology** — do not ship smokes that only re-assert event-sourced fields with no independent chain read, or that compare fields the indexer never mirrors (e.g. `Pool.isActive` vs `isPoolActive`).
4. **Unsampled where cheap** — bounded domains (`deployment`, `escrow`, `token-count` per pool) run fully; large investor tables are out of scope for v1.
5. **Diverse sampling** — when `--sample` caps rows, **randomize across pools, tokens, and chains** — never the first N from GraphQL sort order ([_shared.md](./_shared.md)). **`onramp` is exempt** — always full managers + full asset probe.
6. **Cross-chain lag** — skip rows with `crosschainInProgress` by default; live **prices** excluded; **historical prices at snapshot block** included in `snapshots` smoke.
7. **Historical layer** — snapshot `blockNumber` pins `eth_call`; verifies the indexer recorded the right value **at the right block** (see [snapshots.md](./snapshots.md)).

Shared CLI/runtime: [_shared.md](./_shared.md).

## Core suite (implement these)

| ID | Mode | Signal | Spec |
|----|------|--------|------|
| `issuance` | Correctness | `TokenInstance.totalIssuance` === `ERC20.totalSupply()` | [issuance.md](./issuance.md) |
| `onramp` | **Completeness + correctness** | **Full** scan: every manager × every chain ERC-20 asset ↔ `onramp(asset)` | [onramp.md](./onramp.md) |
| `deployment` | Correctness | `Deployment.centrifugeId` === `Gateway.localCentrifugeId()` | [deployment.md](./deployment.md) |
| `pool` | Correctness | Hub `Pool.currency` / `decimals` vs `HubRegistry` | [pool.md](./pool.md) |
| `token-count` | **Completeness** | `ShareClassManager.shareClassCount` vs GraphQL `tokens.totalCount` | [token-count.md](./token-count.md) |
| `pool-spoke-presence` | **Completeness** | `Spoke.isPoolActive` ↔ `PoolSpokeBlockchain` row | [pool-spoke-presence.md](./pool-spoke-presence.md) |
| `asset` | Correctness | Hub `decimals` + spoke `idToAsset` / `assetToId` | [asset.md](./asset.md) |
| `token-instance` | Correctness | `TokenInstance.address` === `Spoke.shareToken` | [token-instance.md](./token-instance.md) |
| `escrow` | Correctness | `Escrow.address` === `BalanceSheet.escrow` | [escrow.md](./escrow.md) |
| `vault` | Correctness | `Vault` linkage + `assetId` vs `VaultRegistry.vaultDetails` | [vault.md](./vault.md) |
| `snapshots` | **Historical correctness** | Pinned `eth_call` at `snapshot.blockNumber` (issuance, hub/spoke price, pool currency) | [snapshots.md](./snapshots.md) |

**11 smokes** — 10 live + 1 historical layer. Live suite covers registry, pools, share classes, assets, escrows, vaults, issuance, on-ramp. `snapshots` catches block-attribution and snapshotter drift.

## Explicitly not in the core suite

Archived under [archive/](./archive/) with rationale. Do not implement unless the indexer model or on-chain enumeration story changes.

| Former ID | Why excluded |
|-----------|----------------|
| `pool-active` | Compared wrong field (`Pool.isActive` is not `isPoolActive`) |
| `asset-registration` | Merged into `asset` |
| `token-metadata`, `token-price-hub` | Brittle strings / cross-chain price lag |
| `offramp` | Receivers not enumerable; correctness-only on sampled rows |
| `pool-manager`, `ward` | No chain enumeration; sampled indexed edges only |
| `position-balance` | Large domain; sampling = spot check, not integrity |
| `holding-*`, `vault-orders`, `batch-*` | Event/accounting semantics ≠ single view |
| `whitelist`, `sync-max-reserve`, `merkle-manager` | Low signal or trivial single field |
| `holding-escrow-snapshots` | Historical; fragile — superseded by selective fields in [snapshots.md](./snapshots.md) |

## Invocation

```bash
pnpm smoke                                    # all core smokes (live + snapshots)
pnpm smoke --only issuance,onramp,snapshots   # high-signal subset
pnpm smoke snapshots --snapshots-per-type 5   # historical only
pnpm smoke --graphql https://api.centrifuge.io/ --mismatches-only
```
