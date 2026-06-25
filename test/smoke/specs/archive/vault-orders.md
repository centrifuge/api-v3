# Smoke: `vault-orders`

| | |
|--|--|
| **Tier** | 2 |
| **Entities** | `VaultInvestOrder`, `Vault` |
| **Chains** | Spoke |

## Purpose

Verify per-investor async vault deposit state: pending and claimable asset amounts vs `AsyncRequestManager`.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `VaultInvestOrder.requestedAssetsAmount` | `pendingDepositRequest(vault, user)` | `AsyncRequestManager` |
| `VaultInvestOrder.claimableAssetsAmount` | `maxDeposit(vault, user)` or `maxMint` converted | `AsyncRequestManager` |

Use `AsyncRequestManager` from spoke deployment. Resolve vault address: query `Vault` where `(tokenId, centrifugeId, assetId)` matches order key.

## GraphQL query

```graphql
query VaultInvestOrders($limit: Int!, $after: String, $where: VaultInvestOrderFilter) {
  vaultInvestOrders(limit: $limit, after: $after, where: $where) {
    items {
      tokenId
      centrifugeId
      assetId
      accountAddress
      requestedAssetsAmount
      claimableAssetsAmount
      poolId
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

Resolve vault `id` via secondary query or nested relation if available.

## RPC calls

```solidity
// IAsyncVault / IVaultManager
function pendingDepositRequest(IBaseVault vault, address user) external view returns (uint256 assets);
function maxDeposit(IBaseVault vault, address user) external view returns (uint256 assets);
```

Alternative: `investments(vault, investor)` struct for full state.

## Comparison

Bigint match with `--tolerance` per amount field.

## Sampling

- Prefer rows where `requestedAssetsAmount > 0` OR `claimableAssetsAmount > 0`.
- `--sample 100`.

## Skip conditions

- Vault not linked / not found.
- Sync vaults (no async manager state) — skip.
- Missing RPC.

## Known limitations

- Must map GraphQL order to correct vault contract (multiple vaults per pool/sc/asset possible — match `assetId`).
- Cancel-pending states not in `VaultInvestOrder` columns — may need `investments()` for full parity later.

## Examples

```bash
pnpm smoke vault-orders --chain base --sample 30
```
