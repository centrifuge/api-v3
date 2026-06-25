# Smoke: `merkle-manager`

| | |
|--|--|
| **Tier** | 2 |
| **Entities** | `MerkleProofManager` |
| **Chains** | Spoke (deploy chain) |

## Purpose

Verify deployed merkle proof manager is wired to the correct pool via on-chain `poolId()` view.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `MerkleProofManager.poolId` | `poolId()` | Manager contract at `address` |

## GraphQL query

```graphql
query MerkleProofManagers($limit: Int!, $after: String) {
  merkleProofManagers(limit: $limit, after: $after) {
    items {
      address
      centrifugeId
      poolId
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
// MerkleProofManager (per deploy ABI)
function poolId() external view returns (uint64);
```

ABI from registry / handler eth_call pattern in [`merkleProofManagerHandlers.ts`](../../src/handlers/merkleProofManagerHandlers.ts).

## Comparison

`BigInt(indexed.poolId) === BigInt(onchain.poolId)`.

## Sampling

- All managers (typically small N) — no aggressive sampling.

## Skip conditions

- Missing RPC.
- Contract has no code.

## Known limitations

- Does not verify merkle root / policy (`Policy` entity) — root not fully mirrored in GraphQL.
- Strategist permissions not checked.

## Examples

```bash
pnpm smoke merkle-manager
```
