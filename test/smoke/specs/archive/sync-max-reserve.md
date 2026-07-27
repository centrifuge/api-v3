# Smoke: `sync-max-reserve`

| | |
|--|--|
| **Tier** | 2 |
| **Entities** | `Vault` |
| **Chains** | Spoke |

## Purpose

Verify `Vault.maxReserve` for sync / sync-deposit vault kinds against `SyncManager.maxReserve`.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `Vault.maxReserve` | `maxReserve(poolId, scId, asset, tokenId)` | `SyncManager` |

## GraphQL query

```graphql
query Vaults($limit: Int!, $after: String, $where: VaultFilter) {
  vaults(limit: $limit, after: $after, where: $where) {
    items {
      id
      centrifugeId
      kind
      poolId
      tokenId
      assetId
      assetAddress
      maxReserve
      crosschainInProgress
      asset { assetTokenId }
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

Filter: `kind` in `Sync`, `SyncDepositAsyncRedeem` (exclude pure `Async`).

## RPC calls

```solidity
// SyncManager
function maxReserve(PoolId poolId, ShareClassId scId, address asset, uint256 tokenId)
  external view returns (uint128);
```

## Comparison

Bigint exact or `--tolerance` 0.

## Sampling

- Linked sync vaults only.
- `--sample 100`.

## Skip conditions

- `kind: Async`.
- `crosschainInProgress: MaxReserve`.
- Missing asset address / tokenId for ERC-6909.

## Known limitations

- Async vaults have `maxReserve` 0 or unused — must filter by kind.

## Examples

```bash
pnpm smoke sync-max-reserve --chain plume
```
