# Smoke: `position-balance`

| | |
|--|--|
| **Tier** | 1 |
| **Entities** | `TokenInstancePosition`, `TokenInstance` |
| **Chains** | Spoke |

## Purpose

Verify investor share **balances** on `TokenInstancePosition` match ERC-20 `balanceOf` on the share token. Does **not** verify PnL fields.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `TokenInstancePosition.balance` | `balanceOf(account)` | Share token at `TokenInstance.address` |

## GraphQL query

```graphql
query Positions($limit: Int!, $after: String, $where: TokenInstancePositionFilter) {
  tokenInstancePositions(limit: $limit, after: $after, where: $where) {
    items {
      tokenId
      centrifugeId
      accountAddress
      balance
      tokenInstance { address }
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

Filter / order: `balance > 0` first when sampling.

## RPC calls

```solidity
// IERC20 share token
function balanceOf(address account) view returns (uint256);
```

## Comparison

Bigint match with `--tolerance` (default 1 wei).

## Sampling

- Strongly prefer `balance > 0` (non-zero positions).
- `--sample 100`.

## Skip conditions

- Missing token instance address.
- Missing RPC.

## Out of scope (explicit)

| Field | Reason |
|-------|--------|
| `cumulativeEarnings` | Indexer-derived from transfers + price |
| `costBasis` | Indexer-derived |
| `cumulativeRealizedPnl` | Indexer-derived |
| `tokenPriceAtLastChange` | Event-derived |

## Known limitations

- Positions with zero on-chain balance but non-zero indexed balance after recent transfer — may indicate indexer lag; report mismatch.

## Examples

```bash
pnpm smoke position-balance --chain plume --sample 100
```
