# Smoke: `snapshots`

| | |
|--|--|
| **Tier** | Core (historical) |
| **Mode** | **Historical correctness** — pinned `eth_call` at `snapshot.blockNumber` |
| **Entities** | `TokenInstanceSnapshot`, `TokenSnapshot`, `PoolSnapshot` |
| **Chains** | Per `triggerChainId` / entity `centrifugeId` — not always Ethereum |

## Purpose

Use indexed **`blockNumber`** (and `triggerChainId`) to verify that **period and event snapshots** captured real on-chain state at that block — not today's tip. This is high signal because:

- The check is **time-travel independent** of current indexer live rows.
- `totalSupply()` and registry views at block `N` are authoritative at `N`.
- Catches reindex drift, wrong block attribution, and snapshotter bugs.

Live-tip smokes cannot detect "we stored the right value at the wrong block."

## What we verify (and what we skip)

| Snapshot | Field | On-chain at `blockNumber` | Chain | Include? |
|----------|-------|---------------------------|-------|----------|
| `TokenInstanceSnapshot` | `totalIssuance` | `ERC20.totalSupply()` on share token | Spoke | **Yes** — primary |
| `TokenSnapshot` | `tokenPrice` | `ShareClassManager.pricePoolPerShare` → D18 raw | Hub | **Yes** |
| `TokenSnapshot` | `totalIssuance` | `ShareClassManager.totalIssuance` | Hub | **Yes** — hub aggregate semantics |
| `TokenInstanceSnapshot` | `tokenPrice` | `Spoke.pricePoolPerShare(..., false)` D18 raw | Spoke | **Yes** — with cross-chain skip |
| `PoolSnapshot` | `currency` | `HubRegistry.currency(poolId)` | Hub | **Yes** — slow-changing |
| `HoldingEscrowSnapshot` | `assetAmount` | `PoolEscrow.holding(...).total` | Spoke | No — reserved/total ambiguity |
| `HoldingSnapshot` | `assetQuantity` / `totalValue` | `Holdings.holding` | Hub | No — valuation / event accounting |
| `TokenSnapshot` yield columns | `yield*` | — | — | No — indexer-derived |

## GraphQL queries

**Recent token instance snapshots (sampled):**

```graphql
query TokenInstanceSnapshotsRecent($limit: Int!, $after: String, $orderBy: String) {
  tokenInstanceSnapshots(
    limit: $limit
    after: $after
    orderBy: "blockNumber"
    orderDirection: "desc"
  ) {
    items {
      tokenId
      centrifugeId
      blockNumber
      trigger
      triggerChainId
      totalIssuance
      tokenPrice
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

**Recent hub token snapshots:**

```graphql
query TokenSnapshotsRecent($limit: Int!, $after: String) {
  tokenSnapshots(limit: $limit, after: $after, orderBy: "blockNumber", orderDirection: "desc") {
    items {
      id
      blockNumber
      trigger
      triggerChainId
      totalIssuance
      tokenPrice
      tokenPriceComputedAt
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

**Recent pool snapshots:**

```graphql
query PoolSnapshotsRecent($limit: Int!, $after: String) {
  poolSnapshots(limit: $limit, after: $after, orderBy: "blockNumber", orderDirection: "desc") {
    items {
      id
      blockNumber
      trigger
      triggerChainId
      currency
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

Resolve share token address / `poolId` via live `tokenInstance` / `token` lookup at query time (addresses stable across blocks).

## RPC pattern

```javascript
await client.readContract({
  address,
  abi,
  functionName: "totalSupply",
  blockNumber: BigInt(snapshot.blockNumber),
});
```

Use `triggerChainId` → EVM `chainId` for RPC client selection when present. For hub `TokenSnapshot` / `PoolSnapshot` reads, resolve chain from linked `pool.centrifugeId`. Fall back to entity `centrifugeId` on token instance snapshots.

## Comparisons

| Check | Rule | Tolerance |
|-------|------|-----------|
| Instance `totalIssuance` | `=== totalSupply(block)` | `--tolerance` wei |
| Hub `tokenPrice` | D18 raw `=== pricePoolPerShare(block).price` | 0 |
| Hub `totalIssuance` | `=== shareClassManager.totalIssuance(block)` | `--tolerance` — hub may lag spoke; note in mismatch |
| Spoke snapshot `tokenPrice` | D18 raw vs `pricePoolPerShare(block)` | 0 |
| Pool `currency` | `=== hubRegistry.currency(block)` | 0 |

## Sampling strategy

Default: **diverse random** recent snapshots — not the same pool/token every run.

1. Paginate a candidate buffer (≥ `snapshotsPerType * 10` per entity type, `orderBy: blockNumber desc`).
2. Stratify by `(poolId or tokenId, centrifugeId)` depending on snapshot type.
3. **Round-robin random pick** until `--snapshots-per-type` per table reached.
4. Optionally `--sample-seed` for reproducible CI.

Deep single-token history remains on **`issuance --since-creation`**, not here.

## Skip conditions

- RPC provider lacks archival state at `blockNumber` — skip with warning (not mismatch).
- Snapshot block within last 2 blocks of tip — optional skip (state still settling).
- `trigger` indicates cross-chain price notify in same tx window — skip spoke `tokenPrice` if `crosschainInProgress` on live row.
- Share token / pool not deployed at `blockNumber` — skip.

## Relationship to `issuance` smoke

| | `issuance` | `snapshots` |
|--|------------|-------------|
| Live tip | Primary | No |
| `TokenInstanceSnapshot` | Deep walk (`--since-creation`) for one/all instances | Broad sample across instances |
| Hub `TokenSnapshot` | No | Yes (price + hub issuance) |
| `PoolSnapshot` | No | Yes (`currency`) |

Run **`pnpm smoke snapshots`** nightly; **`pnpm smoke issuance`** for live supply + optional deep instance history.

## Smoke-specific options

| Flag | Description |
|------|-------------|
| `--snapshots-per-type <n>` | Cap per snapshot table |
| `--snapshot-triggers <csv>` | Filter by `trigger` prefix |
| `--types <csv>` | Subset: `instance,token,pool` |

## Examples

```bash
pnpm smoke snapshots --mismatches-only
pnpm smoke snapshots --snapshots-per-type 10 --types instance,token
pnpm smoke snapshots --graphql http://127.0.0.1:42069/ --since-block 20000000
```

## Why this is not tautology

Snapshot rows are **claims about chain state at block B**. `eth_call(..., { blockNumber: B })` is an independent read of chain state at B. A mismatch means the snapshotter or handler attributed the wrong value or block — something live smokes cannot catch.
