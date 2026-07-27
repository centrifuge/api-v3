# Smoke: `pool-active`

| | |
|--|--|
| **Tier** | 1 |
| **Entities** | `Pool`, `PoolSpokeBlockchain` |
| **Chains** | Spoke (per `PoolSpokeBlockchain.centrifugeId`) |

## Purpose

For each pool deployed on a spoke chain, verify indexed `Pool.isActive` matches `Spoke.isPoolActive(poolId)` on that spoke.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `Pool.isActive` | `isPoolActive(PoolId)` | `Spoke` on spoke deployment |

**Note:** Compare using the pool row in context of each `PoolSpokeBlockchain` link — activation is spoke-scoped; hub `Pool.isActive` may aggregate hub+spoke signals. Implementation should read `poolSpokeBlockchains` and call spoke per link.

## GraphQL query

```graphql
query PoolSpokeLinks($limit: Int!, $after: String, $where: PoolSpokeBlockchainFilter) {
  poolSpokeBlockchains(limit: $limit, after: $after, where: $where) {
    items {
      poolId
      centrifugeId
      pool { isActive }
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
// ISpoke
function isPoolActive(PoolId poolId) external view returns (bool);
```

## Comparison

Boolean exact: `indexed pool.isActive` vs `isPoolActive(poolId)`.

**Clarification for implementers:** If indexer models activation per spoke differently than a single `Pool.isActive`, align spec with handler behavior in [`hubHandlers.ts`](../../src/handlers/hubHandlers.ts) / `hub:NotifyPool` — document any intentional divergence in mismatch `note`.

## Sampling

- `--sample 100` on `poolSpokeBlockchains` rows.
- Prefer active pools first.

## Skip conditions

- `crosschainInProgress` on related pool notify (if exposed).
- Missing spoke RPC.

## Known limitations

- Hub-side pool creation vs spoke activation timing may cause transient lag after `NotifyPool` — use `--skip-crosschain` during cross-chain notify windows.

## Examples

```bash
pnpm smoke pool-active --chain plume
```
