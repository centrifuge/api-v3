# Smoke: `holding-escrow-snapshots`

| | |
|--|--|
| **Tier** | 3 (optional / historical) |
| **Entities** | `HoldingEscrowSnapshot` |
| **Chains** | Spoke |

## Purpose

Verify historical holding escrow amounts at snapshot `blockNumber` match `PoolEscrow.holding` at that block. Complements live `holding-escrow` smoke.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `HoldingEscrowSnapshot.assetAmount` | `holding(scId, asset, tokenId).total` at `blockNumber` | `PoolEscrow` |

## GraphQL query

```graphql
query HoldingEscrowSnapshots($limit: Int!, $after: String, $orderBy: String) {
  holdingEscrowSnapshots(
    limit: $limit
    after: $after
    orderBy: "blockNumber"
    orderDirection: "desc"
  ) {
    items {
      tokenId
      assetId
      blockNumber
      assetAmount
      trigger
      escrowAddress
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

Join live `holdingEscrow` for `escrowAddress`, `assetAddress`, `assetTokenId`.

## RPC calls

```solidity
function holding(ShareClassId scId, address asset, uint256 tokenId)
  external view returns (uint128 total, uint128 reserved);
```

Pass `blockNumber` from snapshot to viem `readContract`.

## Comparison

`assetAmount` vs `total` with `--tolerance` at pinned block.

## Sampling

- Default: **N most recent snapshots per escrow** (e.g. `--snapshots 5` smoke-specific option, or global `--sample`).
- Prefer non-zero `assetAmount`.

## Smoke-specific options (proposed)

| Flag | Default | Description |
|------|---------|-------------|
| `--snapshots <n>` | `5` | Max snapshots per `(tokenId, assetId)` |

## Skip conditions

- Escrow not deployed at snapshot block (historical deploy).
- Holding not initialized at block.

## Known limitations

- `assetPrice` at snapshot not included (price may come from separate notify event).
- Storage layout changes across protocol upgrades may break ancient snapshots.

## Examples

```bash
pnpm smoke holding-escrow-snapshots --snapshots 3 --chain plume
pnpm smoke holding-escrow-snapshots --at-block 21000000  # pin RPC for all reads
```

## Related

- Live checks: [holding-escrow.md](./holding-escrow.md)
- Issuance snapshot pattern: [issuance.md](./issuance.md)
