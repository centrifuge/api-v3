# Smoke: `issuance`

| | |
|--|--|
| **Tier** | Core |
| **Mode** | Correctness |
| **Entities** | `TokenInstance` (+ optional `TokenInstanceSnapshot`) |
| **Chains** | Spoke (per `tokenInstance.centrifugeId`) |

## Purpose

Verify indexed share **total issuance** against authoritative `ERC20.totalSupply()` at chain tip.

**Historical checks:** use [`snapshots`](./snapshots.md) for cross-entity snapshot sampling, or this smoke's `--since-creation` / `--snapshots` for a **deep walk** on one or all `TokenInstanceSnapshot` rows.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `TokenInstance.totalIssuance` | `totalSupply()` | Share token at `TokenInstance.address` |
| `TokenInstanceSnapshot.totalIssuance` | `totalSupply()` at `blockNumber` | Same ERC-20 |

## GraphQL queries

**List instances (paginated):**

```graphql
query TokenInstances($limit: Int!, $after: String, $where: TokenInstanceFilter) {
  tokenInstances(limit: $limit, after: $after, orderBy: "address", orderDirection: "asc", where: $where) {
    items {
      centrifugeId
      tokenId
      address
      totalIssuance
      decimals
      isActive
      crosschainInProgress
      token { symbol poolId }
      blockchain { id name }
    }
    pageInfo { endCursor hasNextPage }
    totalCount
  }
}
```

**Snapshots (when `--since-creation` or `--snapshots`):**

```graphql
query TokenInstanceSnapshots($tokenId: String!, $centrifugeId: String!, $limit: Int!, $after: String) {
  tokenInstanceSnapshots(
    where: { tokenId: $tokenId, centrifugeId: $centrifugeId }
    limit: $limit
    after: $after
    orderBy: "blockNumber"
    orderDirection: "desc"
  ) {
    items { blockNumber totalIssuance trigger }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
// IERC20 at tokenInstance.address
function totalSupply() view returns (uint256);
```

- **Live check:** `readContract` at latest block (or `--at-block`).
- **Snapshot check:** `readContract` with `blockNumber: snapshot.blockNumber`.

## Comparison

- Compare `BigInt(indexed.totalIssuance)` vs `onchain.totalSupply`.
- **Tolerance:** global `--tolerance` (default 1 wei).
- Treat `|delta| <= tolerance` as match.

## Sampling

Uses **diverse randomized sampling** ([_shared.md](./_shared.md)): spread across `(centrifugeId, poolId, tokenId)`, not first N rows.

| Mode | Behavior |
|------|----------|
| Default | Active `tokenInstances`, `--sample` cap with stratification |
| `--all-instances` | All instances; snapshot sub-walk uses diverse order per instance |
| `--symbol` / `--token-id` | Single share class — stratification N/A |

Prefer `isActive: true` in the candidate buffer before shuffle.

## Smoke-specific options

| Flag | Default | Description |
|------|---------|-------------|
| `--symbol <SYMBOL>` | — | Filter via `token.symbol` |
| `--all-instances` | false | Scan all token instances |
| `--since-creation` | false | Walk all period snapshots (paginated) |
| `--snapshots <n>` | `5` (or `1` with `--all-instances`) | Max recent snapshots per instance |
| `--with-live` | false | With `--all-instances`, also check live row |
| `--latest-snapshot-only` | false | Skip live check in single-token mode |

## Skip conditions

- `crosschainInProgress` set (if `--skip-crosschain`).
- Missing RPC (`ERPC_BASE_URL` unset and no Chainlist public fallback for the chain).
- Share token has no bytecode at the read block.
- `totalSupply()` reverts at the read block (non-standard / RPC cannot serve the call).

## Known limitations

- Hub `Token.totalIssuance` is **not** checked here (aggregated across networks; use hub `ShareClassManager.totalIssuance` in a future smoke if needed).
- Does not verify `tokenPrice` or transfer-derived position accounting.

## Examples

```bash
pnpm smoke issuance --symbol ACRDX --chain plume
pnpm smoke issuance --all-instances --mismatches-only --with-live
pnpm smoke issuance --token-id 0x0001... --since-creation --graphql http://127.0.0.1:42069/
```

## Implementation reference

Existing logic: [`scripts/verify-issuance-snapshots.mjs`](../../scripts/verify-issuance-snapshots.mjs).
