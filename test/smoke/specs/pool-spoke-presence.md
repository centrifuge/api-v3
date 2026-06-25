# Smoke: `pool-spoke-presence`

| | |
|--|--|
| **Tier** | Core |
| **Mode** | **Completeness + correctness** (spoke deployment link) |
| **Entities** | `PoolSpokeBlockchain` |
| **Chains** | Spoke (per link) |

## Purpose

Verify spoke pool activation matches indexed cross-chain pool links. Replaces the flawed `pool-active` smoke (which compared `Pool.isActive` — a field the indexer does **not** mirror from `isPoolActive`).

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| Row exists for `(poolId, centrifugeId)` | `isPoolActive(poolId) == true` | `Spoke` |
| Row absent | `isPoolActive(poolId) == false` | `Spoke` |

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
| GraphQL link → chain | `isPoolActive(poolId)` must be `true` |
| Chain active → GraphQL | If `isPoolActive` and pool is in scope, `poolSpokeBlockchain` row must exist |

**Do not** compare `Pool.isActive` on the hub pool row.

## Sampling

- All `poolSpokeBlockchains` rows (bounded).
- Reverse probe: for each spoke chain, iterate pools known on hub GraphQL and call `isPoolActive` — report missing links only for active pools.

## Skip conditions

- Missing spoke RPC for link's `centrifugeId`.

## Examples

```bash
pnpm smoke pool-spoke-presence
pnpm smoke pool-spoke-presence --chain plume
```

## Replaces

[archive/pool-active.md](./archive/pool-active.md) — deprecated.
