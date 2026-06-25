# Smoke: `token-instance`

| | |
|--|--|
| **Tier** | Core |
| **Mode** | Correctness |
| **Entities** | `TokenInstance`, `Token` |
| **Chains** | Spoke |

## Purpose

Verify the indexed share token **contract address** matches the spoke factory/registry. Supply is covered by `issuance`; price is excluded (cross-chain lag).

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `TokenInstance.address` | `shareToken(poolId, scId)` | `Spoke` |

## GraphQL query

```graphql
query TokenInstances($limit: Int!, $after: String, $where: TokenInstanceFilter) {
  tokenInstances(limit: $limit, after: $after, where: $where) {
    items {
      centrifugeId
      tokenId
      address
      crosschainInProgress
      token { poolId }
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
// ISpoke
function shareToken(PoolId poolId, ShareClassId scId) external view returns (address);
```

## Comparison

Lowercase address exact match.

Prefer `isActive: true` in candidate buffer before shuffle.

## Sampling

- **Diverse random** `--sample` across `(centrifugeId, poolId, tokenId)` — see [_shared.md](./_shared.md).
- `--sample 0` for full nightly run.

## Skip conditions

- `crosschainInProgress` on deploy/link.
- Missing spoke RPC.

## Out of scope (removed)

- `tokenPrice` / `computedAt` — use dedicated price monitoring, not core smoke suite.

## Examples

```bash
pnpm smoke token-instance --chain avalanche
```
