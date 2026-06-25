# Smoke: `batch-pending`

| | |
|--|--|
| **Tier** | 2 |
| **Entities** | `PendingInvestOrder`, `PendingRedeemOrder` |
| **Chains** | Hub |

## Purpose

Verify per-investor hub batch epoch pending amounts against `BatchRequestManager.depositRequest` / `redeemRequest`.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `PendingInvestOrder.pendingAssetsAmount` | `depositRequest(...).pending` | `BatchRequestManager` |
| `PendingInvestOrder.queuedAssetsAmount` | `queuedDepositRequest(...).amount` (if cancelling) | `BatchRequestManager` |
| `PendingRedeemOrder.pendingSharesAmount` | `redeemRequest(...).pending` | `BatchRequestManager` |
| `PendingRedeemOrder.queuedSharesAmount` | `queuedRedeemRequest(...).amount` | `BatchRequestManager` |

## GraphQL query

```graphql
query PendingInvestOrders($limit: Int!, $after: String) {
  pendingInvestOrders(limit: $limit, after: $after) {
    items { poolId tokenId assetId account pendingAssetsAmount queuedAssetsAmount }
    pageInfo { endCursor hasNextPage }
  }
}

query PendingRedeemOrders($limit: Int!, $after: String) {
  pendingRedeemOrders(limit: $limit, after: $after) {
    items { poolId tokenId assetId account pendingSharesAmount queuedSharesAmount }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
// IBatchRequestManager
function depositRequest(PoolId poolId, ShareClassId scId, AssetId assetId, bytes32 investor)
  external view returns (uint128 pending, uint64 lastUpdate);

function redeemRequest(PoolId poolId, ShareClassId scId, AssetId assetId, bytes32 investor)
  external view returns (uint128 pending, uint64 lastUpdate);
```

Investor: `bytes32(uint256(uint160(account)))`.

## Comparison

Pending amounts: bigint + `--tolerance`. Queued cancel amounts: exact when `isCancelling`.

## Sampling

- Non-zero `pending*` first.
- `--sample 100` per order type (or combined budget).

## Skip conditions

- Missing hub RPC.
- Request reverts for zero investor — treat as 0 pending.

## Known limitations

- Hub-only; vault-layer pending in `vault-orders`.
- Does not verify epoch-approved amounts (`InvestOrder` / `EpochInvestOrder` — event history).

## Examples

```bash
pnpm smoke batch-pending --pool-id 281474976710671
```
