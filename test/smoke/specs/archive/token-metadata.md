# Smoke: `token-metadata`

| | |
|--|--|
| **Tier** | 1 |
| **Entities** | `Token` |
| **Chains** | Hub |

## Purpose

Verify share class metadata (`name`, `symbol`, `salt`) indexed on hub `Token` matches `ShareClassManager.metadata(poolId, scId)`.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `Token.name` | `metadata(...).name` | `ShareClassManager` |
| `Token.symbol` | `metadata(...).symbol` | `ShareClassManager` |
| `Token.salt` | `metadata(...).salt` | `ShareClassManager` |

## GraphQL query

```graphql
query Tokens($limit: Int!, $after: String, $where: TokenFilter) {
  tokens(limit: $limit, after: $after, where: $where) {
    items {
      id
      poolId
      name
      symbol
      salt
      centrifugeId
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
// IShareClassManager
function metadata(PoolId poolId, ShareClassId scId)
  external view returns (string memory name, string memory symbol, bytes32 salt);
```

Encode `scId` from `Token.id` (hex bytes16).

## Comparison

| Field | Rule |
|-------|------|
| `name`, `symbol` | Exact string match |
| `salt` | Hex string match (`bytes32` ↔ GraphQL text) |

## Sampling

- `--sample 100`.
- `--token-id` / `--pool-id` filters.

## Skip conditions

- Missing hub RPC.
- Metadata not yet set on-chain (empty strings) — skip or mismatch per product rules; prefer skip with note if `createdAtBlock` within last N blocks.

## Known limitations

- On-chain strings may differ encoding from IPFS-enriched display names if indexer augments metadata off-chain.

## Examples

```bash
pnpm smoke token-metadata --pool-id 281474976710671
```
