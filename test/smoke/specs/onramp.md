# Smoke: `onramp`

| | |
|--|--|
| **Tier** | Core |
| **Mode** | **Completeness + correctness** |
| **Entities** | `OnRampAsset`, `OnOffRampManager`, `Asset` |
| **Chains** | Spoke (manager's `centrifugeId`) |

## Purpose

**Gold-standard smoke:** for each **`OnOffRampManager` row** `(address, centrifugeId)`, probe every ERC-20 asset **registered on that spoke** and verify parity with `onramp(asset)` on **that chain's RPC**. Catches missing rows and wrong flags — not just “indexed rows look consistent.”

Same CREATE3 manager address on Ethereum vs Avalanche is **two independent checks** ([hub-spoke.md](./hub-spoke.md)).

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
// IOnOffRamp at manager.address on the spoke chain for manager.centrifugeId
function onramp(address asset) external view returns (bool);
```

Batch via `--rpc-batch` parallel `readContract` per asset address.

## Comparison

- Boolean exact match (tolerance 0).
- Compare per `(centrifugeId, manager.address, assetAddress)` — `entityId` format: `{centrifugeId}@{chain}:{manager}:{asset}`.

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

- Manager has no bytecode on the spoke chain (CREATE3 address not deployed there).
- `OnRampAsset.crosschainInProgress` set (when `--skip-crosschain`, default).
- Missing RPC for manager chain.
- Asset is ERC-6909 (`assetTokenId != 0`) — excluded from probe set.

## Known limitations

- Probes **every** manager row and **every** ERC-20 asset on that row's spoke — expensive on asset-heavy chains; use `--chain` / `--pool-id` / `--manager` to narrow, not `--sample`.
- Does not verify off-ramp or relayer config (see archived `offramp` spec).
- Missing `OnRampAsset` with on-chain `UpdateOnramp` present may be [Ponder factory-child sync](../../../AGENTS.md#ponder-factory-discovery-cache-bug-pinned-ponder0166), not handler logic.

## Examples

```bash
pnpm smoke onramp --all-managers --mismatches-only
pnpm smoke onramp --chain avalanche --pool-id 281474976710671
pnpm smoke onramp --manager 0x... --graphql https://api.centrifuge.io/
```

## Implementation reference

Existing logic: [`scripts/verify-onofframp-children.mjs`](../../scripts/verify-onofframp-children.mjs).
