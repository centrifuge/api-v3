# Smoke: `pool-spoke-presence`

| | |
|--|--|
| **Tier** | Core |
| **Mode** | **Completeness** (reverse: active on chain ⇒ link exists) |
| **Entities** | `PoolSpokeBlockchain` |
| **Chains** | Spoke (per link) |

## Purpose

Verify spoke pool activation matches indexed cross-chain pool links. Replaces the flawed `pool-active` smoke (which compared `Pool.isActive` — a field the indexer does **not** mirror from `isPoolActive`).

Only the **reverse** direction is checked (active on chain ⇒ link must exist). The forward direction (link ⇒ `isPoolActive`) was removed because `poolSpokeBlockchain` links are append-only: they are created by `Hub:NotifyPool` and never deleted, so a pool notified but never activated on the current spoke keeps its link forever and produces false mismatches. Same root cause as the escrow `isPoolActive` skip in PR #473.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| Row absent for an active pool | `isPoolActive(poolId) == true` | `Spoke` |

The reverse check reports a mismatch when `isPoolActive(poolId)` is `true` on a spoke but no `poolSpokeBlockchain` row exists for `(poolId, centrifugeId)`.

Optional secondary signal: `pool(poolId).createdAt > 0` when `isPoolActive` is ambiguous during migration.

## GraphQL queries

**Indexed links:**

```graphql
query PoolSpokeLinks($limit: Int!, $after: String) {
  poolSpokeBlockchains(limit: $limit, after: $after) {
    items { poolId centrifugeId }
    pageInfo { endCursor hasNextPage }
  }
}
```

**Pools to probe for missing links** (completeness reverse direction):

```graphql
query Pools($limit: Int!, $after: String) {
  pools(limit: $limit, after: $after) {
    items { id }
    pageInfo { endCursor hasNextPage }
  }
}
```

For each active pool on a spoke (from hub notify semantics), expect a `poolSpokeBlockchain` row. Reverse check scope: pools that `isPoolActive` on spoke — if active on-chain but no GraphQL link, **mismatch**.

## RPC calls

```solidity
// ISpoke
function isPoolActive(PoolId poolId) external view returns (bool);
function pool(PoolId poolId) external view returns (uint64 createdAt);
```

## Comparison

| Direction | Rule |
|-----------|------|
| Chain active → GraphQL | If `isPoolActive` and pool is in scope, `poolSpokeBlockchain` row must exist |

The forward direction (GraphQL link → chain `isPoolActive == true`) is **not** checked. `poolSpokeBlockchain` links are append-only (`Hub:NotifyPool` creates them, nothing removes them), so a link can outlive spoke activation — comparing link ⇒ active yields false mismatches for pools notified but never activated on the current spoke (e.g. never migrated to the newest spoke version).

**Do not** compare `Pool.isActive` on the hub pool row.

## Sampling

- All `poolSpokeBlockchains` rows (bounded) are fetched to build the link set used by the reverse check.
- Reverse probe: for each spoke chain, iterate pools known on hub GraphQL and call `isPoolActive` — report missing links only for active pools.

## Skip conditions

- Spoke chain with no `deployment.spoke` address is skipped during the reverse probe.
- Missing spoke RPC for a `centrifugeId`.

## Examples

```bash
pnpm smoke pool-spoke-presence
pnpm smoke pool-spoke-presence --chain plume
```

## Replaces

[archive/pool-active.md](./archive/pool-active.md) — deprecated.
