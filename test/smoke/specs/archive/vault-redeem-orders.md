# Smoke: `vault-redeem-orders`

| | |
|--|--|
| **Tier** | 2 |
| **Entities** | `VaultRedeemOrder`, `Vault` |
| **Chains** | Spoke |

## Purpose

Verify per-investor async vault redeem state: pending shares and claimable amounts vs `AsyncRequestManager`.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `VaultRedeemOrder.requestedSharesAmount` | `pendingRedeemRequest(vault, user)` | `AsyncRequestManager` |
| `VaultRedeemOrder.claimableSharesAmount` | `maxRedeem(vault, user)` or `maxWithdraw` assets | `AsyncRequestManager` |

## GraphQL query

```graphql
query VaultRedeemOrders($limit: Int!, $after: String, $where: VaultRedeemOrderFilter) {
  vaultRedeemOrders(limit: $limit, after: $after, where: $where) {
    items {
      tokenId
      centrifugeId
      assetId
      accountAddress
      requestedSharesAmount
      claimableSharesAmount
      poolId
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
function pendingRedeemRequest(IBaseVault vault, address user) external view returns (uint256 shares);
function maxRedeem(IBaseVault vault, address user) external view returns (uint256 shares);
function maxWithdraw(IBaseVault vault, address user) external view returns (uint256 assets);
```

Align claimable field with indexer semantics (shares vs assets — document which GraphQL column maps to which call).

## Comparison

Bigint with `--tolerance`.

## Sampling

- Non-zero pending or claimable first.
- `--sample 100`.

## Skip conditions

- Unlinked vault.
- Sync vault.
- Missing RPC.

## Known limitations

- Pair with `vault-orders` for full investor async state; `InvestorTransaction` history not checked.

## Examples

```bash
pnpm smoke vault-redeem-orders --chain arbitrum
```
