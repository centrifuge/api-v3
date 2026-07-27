# Smoke: `token-price-hub`

| | |
|--|--|
| **Tier** | 1 |
| **Entities** | `Token` |
| **Chains** | Hub |

## Purpose

Verify hub share price (`Token.tokenPrice`, `Token.tokenPriceComputedAt`) matches `ShareClassManager.pricePoolPerShare`.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `Token.tokenPrice` | `pricePoolPerShare(...).price` (D18 raw) | `ShareClassManager` |
| `Token.tokenPriceComputedAt` | `pricePoolPerShare(...).computedAt` | `ShareClassManager` |

## GraphQL query

```graphql
query Tokens($limit: Int!, $after: String, $where: TokenFilter) {
  tokens(limit: $limit, after: $after, where: $where) {
    items {
      id
      poolId
      tokenPrice
      tokenPriceComputedAt
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
// IShareClassManager
function pricePoolPerShare(PoolId poolId, ShareClassId scId)
  external view returns (D18 price, uint64 computedAt);
```

Extract price via `D18.raw(price)` as `uint128` bigint.

## Comparison

| Field | Rule |
|-------|------|
| `tokenPrice` | Exact bigint (D18 raw); tolerance 0 |
| `tokenPriceComputedAt` | Unix seconds match (or within 1s if timestamp encoding differs) |

## Sampling

- Prefer `tokenPrice > 0`.
- `--sample 100`.

## Skip conditions

- Price not computed on-chain (`computedAt == 0`).
- Cross-chain price notify in progress on related `TokenInstance` (optional skip).

## Known limitations

- Hub price may differ from spoke `TokenInstance.tokenPrice` during cross-chain lag — this smoke checks **hub only**.

## Examples

```bash
pnpm smoke token-price-hub --token-id 0x...
```
