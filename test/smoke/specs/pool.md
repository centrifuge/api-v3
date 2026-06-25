# Smoke: `pool`

| | |
|--|--|
| **Tier** | Core |
| **Mode** | Correctness |
| **Entities** | `Pool` |
| **Chains** | Per `Pool.centrifugeId` — local `HubRegistry` on that chain (not always Ethereum) |

## Purpose

Verify hub registry pool metadata: `currency` (asset id) and `decimals` against `HubRegistry`. Share-class **count** completeness is [`token-count`](./token-count.md).

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `Pool.currency` | `currency(PoolId)` | `HubRegistry` |
| `Pool.decimals` | `decimals(PoolId)` | `HubRegistry` |

## GraphQL query

```graphql
query Pools($limit: Int!, $after: String, $where: PoolFilter) {
  pools(limit: $limit, after: $after, orderBy: "id", orderDirection: "asc", where: $where) {
    items {
      id
      centrifugeId
      currency
      decimals
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

Resolve chain from **`Pool.centrifugeId`** → `deployment(chainId).hubRegistry` on that chain's RPC. Each network runs its own hub stack (CREATE3-same addresses, separate state). Do **not** always use Ethereum hub for pools registered on Arbitrum, Plume, etc.

```solidity
// IHubRegistry on Pool.centrifugeId's chain
function currency(PoolId poolId) external view returns (AssetId);
function decimals(PoolId poolId) external view returns (uint8);
```

## Comparison

| Field | Rule |
|-------|------|
| `currency` | `BigInt(indexed) === BigInt(onchain)` |
| `decimals` | Exact `uint8` |
| `decimals` revert (`AssetNotFound`) | **Mismatch** — indexer has `Pool.decimals` but hub registry cannot resolve decimals for that pool (unset currency or unregistered asset) |

## Sampling

- **Diverse random** `--sample` across `poolId`.
- `--pool-id` filter disables stratification (single pool).

## Skip conditions

- Missing hub RPC.
- RPC / transport errors (not contract reverts).

## Known limitations

- `Pool.name` / `metadata` not checked (IPFS / bytes metadata).
- `Pool.isActive` checked in `pool-active` smoke (spoke view).

## Examples

```bash
pnpm smoke pool --pool-id 281474976710671
```
