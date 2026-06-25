# Smoke: `token-count`

| | |
|--|--|
| **Tier** | Core |
| **Mode** | **Completeness** (per pool) |
| **Entities** | `Token`, `Pool` |
| **Chains** | Per `Pool.centrifugeId` — local `ShareClassManager` on that chain |

## Purpose

Verify GraphQL has exactly as many share classes per pool as the hub registry reports on-chain. One `eth_call` per pool — high completeness signal without log replay.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `tokens(where: { poolId, centrifugeId: pool.centrifugeId }).totalCount` | `shareClassCount(poolId)` | `ShareClassManager` on `Pool.centrifugeId`'s chain |

## GraphQL query

```graphql
query PoolsForCount($limit: Int!, $after: String) {
  pools(limit: $limit, after: $after, orderBy: "id", orderDirection: "asc") {
    items { id centrifugeId }
    pageInfo { endCursor hasNextPage }
  }
}

query TokenCount($poolId: BigInt!, $centrifugeId: String!) {
  tokens(where: { poolId: $poolId, centrifugeId: $centrifugeId }, limit: 1) {
    totalCount
  }
}
```

## RPC calls

Use `Pool.centrifugeId` to select chain, then `deployment.shareClassManager` on that chain (same routing as [`pool`](./pool.md)).

```solidity
// IShareClassManager on Pool.centrifugeId's chain
function shareClassCount(PoolId poolId) external view returns (uint32 count);
```

## Comparison

`Number(totalCount) === Number(shareClassCount)` — exact integer match. GraphQL `centrifugeId` filter must match `Pool.centrifugeId` (the chain where hub `AddShareClass` rows are indexed).

## Sampling

- **No sample cap** — every indexed `Pool` (typically tens, not thousands).
- `--pool-id` narrows to one pool.

## Skip conditions

- Missing hub RPC.
- Pool not `exists` on hub — report mismatch (orphan GraphQL pool).

## Why this smoke matters

Catches **missing `Token` rows** after `AddShareClass` indexing failures. GraphQL→chain row checks cannot.

## Examples

```bash
pnpm smoke token-count
pnpm smoke token-count --pool-id 281474976710671
```
