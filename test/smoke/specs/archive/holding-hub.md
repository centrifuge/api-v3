# Smoke: `holding-hub`

| | |
|--|--|
| **Tier** | 2 |
| **Entities** | `Holding` |
| **Chains** | Hub only (`centrifugeId = "1"`) |

## Purpose

Verify hub-side holding quantities and liability flag against `Holdings.holding` on the hub chain.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `Holding.assetQuantity` | `holding(...).assetAmount` | `Holdings` |
| `Holding.isLiability` | `isLiability(poolId, scId, assetId)` | `Holdings` |
| `Holding.totalValue` | `holding(...).assetAmountValue` (optional) | `Holdings` |

## GraphQL query

```graphql
query Holdings($limit: Int!, $after: String, $where: HoldingFilter) {
  holdings(limit: $limit, after: $after, where: $where) {
    items {
      centrifugeId
      poolId
      tokenId
      assetId
      assetQuantity
      totalValue
      isLiability
      isInitialized
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

Filter: `centrifugeId: "1"` (hub).

## RPC calls

```solidity
// IHoldings
function holding(PoolId poolId, ShareClassId scId, AssetId assetId)
  external view returns (uint128 assetAmount, uint128 assetAmountValue, ...);

function isLiability(PoolId poolId, ShareClassId scId, AssetId assetId) external view returns (bool);
```

Exact struct field names per ABI in generated registry.

## Comparison

| Field | Rule |
|-------|------|
| `assetQuantity` | Bigint, `--tolerance` |
| `totalValue` | Bigint, `--tolerance` |
| `isLiability` | Boolean exact |

## Sampling

- `isInitialized: true` only.
- `--sample 100`.

## Skip conditions

- Non-hub `centrifugeId` rows (spoke holdings use different semantics — out of scope).
- `isInitialized: false`.
- Missing hub RPC.

## Known limitations

- Spoke `Holding` rows (if any with non-hub centrifugeId) are not this smoke's target.
- `valuation` address not verified.

## Examples

```bash
pnpm smoke holding-hub --sample 50
```
