# Smoke: `onramp`

| | |
|--|--|
| **Tier** | Core |
| **Mode** | **Completeness + correctness** |
| **Entities** | `OnRampAsset`, `OnOffRampManager`, `Asset` |
| **Chains** | Spoke (manager's `centrifugeId`) |

## Purpose

**Gold-standard smoke:** for each `OnOffRampManager`, probe every ERC-20 asset on that chain and verify bidirectional parity with `onramp(asset)`. Catches missing rows and wrong flags — not just “indexed rows look consistent.”

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| Row presence + `OnRampAsset.isEnabled` | `onramp(asset)` → `bool` | `IOnOffRamp` at manager address |

**Parity rule:**

- `onramp(asset) == true` ⟺ indexed row exists with `isEnabled: true` (for matching `tokenId`, `centrifugeId`, `assetAddress`).
- `onramp(asset) == false` ⟺ no enabled indexed row (row absent or `isEnabled: false`).

## GraphQL queries

**Managers:**

```graphql
query OnOffRampManagers($limit: Int!, $after: String, $where: OnOffRampManagerFilter) {
  onOffRampManagers(limit: $limit, after: $after, orderBy: "address", orderDirection: "asc", where: $where) {
    items { address centrifugeId poolId tokenId }
    pageInfo { endCursor hasNextPage }
  }
}
```

**Indexed on-ramp assets per manager:**

```graphql
query OnRampAssets($tokenId: String!, $centrifugeId: String!, $limit: Int!) {
  onRampAssets(where: { tokenId: $tokenId, centrifugeId: $centrifugeId }, limit: $limit) {
    items { assetAddress isEnabled crosschainInProgress }
  }
}
```

**Chain ERC-20 assets (probe set):**

```graphql
query ChainAssets($limit: Int!, $after: String, $where: AssetFilter) {
  assets(limit: $limit, after: $after, where: $where) {
    items { address assetTokenId }
    pageInfo { endCursor hasNextPage }
  }
}
```

Filter assets: `centrifugeId` = manager chain, `assetTokenId: "0"` (ERC-20 only).

## RPC calls

```solidity
// IOnOffRamp at manager.address
function onramp(address asset) external view returns (bool);
```

Batch via `--rpc-batch` parallel `readContract` per asset address.

## Comparison

- Boolean exact match (tolerance 0).
- Compare per `(manager, assetAddress)` after normalizing addresses to lowercase.

## Sampling

**Full scan always.** `onramp` ignores global `--sample` and `--sample-seed` — completeness is the point.

| Scope | Strategy |
|-------|----------|
| Managers | **All** indexed `onOffRampManagers` matching filters (paginate to exhaustion) |
| Assets per manager | **All** ERC-20 assets on the manager's chain (`assetTokenId = 0`, paginate to exhaustion) |

Narrow scope only via explicit filters: `--chain`, `--centrifuge-id`, `--pool-id`, `--token-id`, `--manager`. Never subsample managers or assets for speed.

## Smoke-specific options

| Flag | Default | Description |
|------|---------|-------------|
| `--all-managers` | true* | Default: every indexed manager (full enumeration) |
| `--manager <address>` | — | Single manager contract |

\*Default when no chain/pool/token/manager filter is set.

## Skip conditions

- `OnRampAsset.crosschainInProgress` set.
- Missing RPC for manager chain.
- Asset is ERC-6909 (`assetTokenId != 0`) — excluded from probe set.

## Known limitations

- Probes **every** manager and **every** ERC-20 asset on the relevant chain(s) — expensive on asset-heavy chains; use `--chain` / `--pool-id` / `--manager` to narrow, not `--sample`.
- Does not verify off-ramp or relayer config (see archived `offramp` spec).

## Examples

```bash
pnpm smoke onramp --all-managers --mismatches-only
pnpm smoke onramp --chain avalanche --pool-id 281474976710671
pnpm smoke onramp --manager 0x... --graphql https://api.centrifuge.io/
```

## Implementation reference

Existing logic: [`scripts/verify-onofframp-children.mjs`](../../scripts/verify-onofframp-children.mjs).
