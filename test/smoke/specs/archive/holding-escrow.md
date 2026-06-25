# Smoke: `holding-escrow`

| | |
|--|--|
| **Tier** | 2 |
| **Entities** | `HoldingEscrow` |
| **Chains** | Spoke |

## Purpose

Verify pool escrow holding amounts and asset prices against `PoolEscrow.holding` and `Spoke.pricePoolPerAsset`.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `HoldingEscrow.assetAmount` | `holding(scId, asset, tokenId).total` | `PoolEscrow` at `escrowAddress` |
| `HoldingEscrow.assetPrice` | `pricePoolPerAsset(poolId, scId, assetId, false)` D18 raw | `Spoke` |

## GraphQL query

```graphql
query HoldingEscrows($limit: Int!, $after: String, $where: HoldingEscrowFilter) {
  holdingEscrows(limit: $limit, after: $after, where: $where) {
    items {
      tokenId
      assetId
      poolId
      centrifugeId
      assetAddress
      assetAmount
      assetPrice
      escrowAddress
      crosschainInProgress
      asset { assetTokenId }
      token { poolId }
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
// IPoolEscrow
function holding(ShareClassId scId, address asset, uint256 tokenId)
  external view returns (uint128 total, uint128 reserved);

// ISpoke
function pricePoolPerAsset(PoolId poolId, ShareClassId scId, AssetId assetId, bool checkValidity)
  external view returns (D18);
```

Compare `assetAmount` to `total` (not `reserved` unless indexer models available only).

## Comparison

| Field | Tolerance |
|-------|-----------|
| `assetAmount` | `--tolerance` wei |
| `assetPrice` | 0 (exact D18 raw) |

## Sampling

- Prefer `assetAmount > 0`.
- `--sample 100`.

## Skip conditions

- `crosschainInProgress` (`NotifyAssetPrice`).
- Holding not initialized on escrow (revert).
- ERC-6909: pass `asset.assetTokenId` to `holding`.

## Known limitations

- `maxAssetPriceAge` not verified on-chain in single call (use markers if added later).

## Examples

```bash
pnpm smoke holding-escrow --pool-id 281474976710671
```
