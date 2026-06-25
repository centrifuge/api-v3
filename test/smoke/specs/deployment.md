# Smoke: `deployment`

| | |
|--|--|
| **Tier** | Core |
| **Mode** | Correctness |
| **Entities** | `Deployment` |
| **Chains** | All indexed chains |

## Purpose

Verify each deployment row's `centrifugeId` matches the on-chain gateway identity. One call per chain — confirms the indexer wired the correct logical chain, not proxy bytecode noise.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `Deployment.centrifugeId` | `localCentrifugeId()` | `gateway` on deployment row |

## GraphQL query

```graphql
query Deployments($limit: Int!) {
  deployments(limit: $limit) {
    items {
      chainId
      centrifugeId
      gateway
      blockchain { name }
    }
  }
}
```

## RPC calls

```solidity
// IGateway
function localCentrifugeId() external view returns (uint16);
```

## Comparison

`String(onchain) === deployment.centrifugeId` — exact.

## Sampling

- **All deployment rows** (no cap).

## Skip conditions

- Missing RPC for `chainId`.
- Null `gateway` address.

## Out of scope (removed from spec)

- `getCode` bytecode checks — prove existence only, not correctness; high noise on proxies.

## Examples

```bash
pnpm smoke deployment
```
