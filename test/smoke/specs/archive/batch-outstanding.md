# Smoke: `batch-outstanding`

| | |
|--|--|
| **Tier** | 2 |
| **Entities** | `EpochOutstandingInvest`, `EpochOutstandingRedeem` |
| **Chains** | Hub |

## Purpose

Verify pool-level aggregate pending deposit/redeem totals against `BatchRequestManager.pendingDeposit` / `pendingRedeem`.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `EpochOutstandingInvest.pendingAssetsAmount` | `pendingDeposit(poolId, scId, assetId)` | `BatchRequestManager` |
| `EpochOutstandingInvest.queuedAssetsAmount` | Sum or contract queued pool state if exposed | `BatchRequestManager` |
| `EpochOutstandingRedeem.pendingSharesAmount` | `pendingRedeem(poolId, scId, assetId)` | `BatchRequestManager` |
| `EpochOutstandingRedeem.queuedSharesAmount` | Queued redeem pool state | `BatchRequestManager` |

## GraphQL query

```graphql
query EpochOutstandingInvest($limit: Int!, $after: String) {
  epochOutstandingInvests(limit: $limit, after: $after) {
    items { poolId tokenId assetId pendingAssetsAmount queuedAssetsAmount }
    pageInfo { endCursor hasNextPage }
  }
}

query EpochOutstandingRedeem($limit: Int!, $after: String) {
  epochOutstandingRedeems(limit: $limit, after: $after) {
    items { poolId tokenId assetId pendingSharesAmount queuedSharesAmount }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
function pendingDeposit(PoolId poolId, ShareClassId scId, AssetId assetId) external view returns (uint128);
function pendingRedeem(PoolId poolId, ShareClassId scId, AssetId assetId) external view returns (uint128);
```

## Comparison

Bigint + `--tolerance` on pending totals.

Queued amounts: verify against contract if view exists; otherwise mark queued fields as **skip** until ABI confirmed.

## Sampling

- Non-zero pending first.
- `--sample 100`.

## Skip conditions

- Missing hub RPC.
- No batch request manager on hub deployment.

## Known limitations

- Queued pool-level aggregates may be indexer-derived from events — if no single on-chain view, document and skip `queued*` fields.

## Examples

```bash
pnpm smoke batch-outstanding --sample 50
```
