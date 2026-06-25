# Smoke: `escrow`

| | |
|--|--|
| **Tier** | Core |
| **Mode** | Correctness |
| **Entities** | `Escrow` |
| **Chains** | Spoke |

## Purpose

Verify indexed pool escrow contract address matches `BalanceSheet.escrow(poolId)` (or `PoolEscrowFactory.escrow`).

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `Escrow.address` | `escrow(PoolId)` | `BalanceSheet` or `PoolEscrowFactory` |

Prefer `BalanceSheet.escrow` — canonical for balance sheet operations.

## GraphQL query

```graphql
query Escrows($limit: Int!, $after: String, $where: EscrowFilter) {
  escrows(limit: $limit, after: $after, where: $where) {
    items {
      address
      poolId
      centrifugeId
      createdAtBlock
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
// IBalanceSheet
function escrow(PoolId poolId) external view returns (IPoolEscrow);
```

Returns address of `PoolEscrow` implementation.

## Comparison

Address exact match (lowercase).

**Multiple rows per pool:** a pool can have several historical `Escrow` rows on the same chain after redeploy/migration. `BalanceSheet.escrow(poolId)` always returns the **current** escrow. Before comparing, keep only the row with the highest `createdAtBlock` per `(poolId, centrifugeId)` — same rule as `EscrowService.getLatest` in the indexer.

## Sampling

- One check per `(poolId, centrifugeId)` after newest-row dedup, then `--sample` if set.
- `--pool-id` filter.

## Skip conditions

- Missing spoke RPC.
- Pool not yet activated on spoke.

## Known limitations

- Does not verify escrow **balances** (see `holding-escrow`).
- v3-era escrows vs v3_1 `BalanceSheet.escrow` CREATE2 slots produce false mismatches for unmigrated pools; see [docs/10-entity-provenance.md](../../docs/10-entity-provenance.md) for the planned `createdBy*` filter/skip.

## Examples

```bash
pnpm smoke escrow --chain plume
```
