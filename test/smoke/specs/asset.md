# Smoke: `asset`

| | |
|--|--|
| **Tier** | Core |
| **Mode** | Correctness |
| **Entities** | `Asset`, `AssetRegistration` |
| **Chains** | Per `AssetRegistration.centrifugeId` (hub registry) + per `Asset.centrifugeId` (spoke) |

## Purpose

Two independent checks per asset id — hub decimals and spoke address mapping — each a single authoritative registry view.

## Fields under test

### Hub (`AssetRegistration`)

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `AssetRegistration.decimals` | `decimals(AssetId)` | `HubRegistry` on `AssetRegistration.centrifugeId`'s chain |

### Spoke (`Asset` with `centrifugeId`)

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `Asset.address`, `Asset.assetTokenId` | `idToAsset(assetId)` | `Spoke` |
| `Asset.id` | `assetToId(address, tokenId)` | `Spoke` |

## GraphQL queries

```graphql
query AssetRegistrations($limit: Int!, $after: String) {
  assetRegistrations(limit: $limit, after: $after) {
    items { assetId centrifugeId decimals }
    pageInfo { endCursor hasNextPage }
  }
}

query SpokeAssets($limit: Int!, $after: String, $where: AssetFilter) {
  assets(limit: $limit, after: $after, where: $where) {
    items { id centrifugeId address assetTokenId }
    pageInfo { endCursor hasNextPage }
  }
}
```

Spoke filter: `centrifugeId` not null.

## RPC calls

```solidity
// HubRegistry (hub chain)
function decimals(AssetId assetId) external view returns (uint8);

// Spoke (spoke chain)
function idToAsset(AssetId assetId) external view returns (address asset, uint256 tokenId);
function assetToId(address asset, uint256 tokenId) external view returns (AssetId);
```

## Comparison

| Field | Rule |
|-------|------|
| `decimals` | Exact `uint8` |
| `decimals` revert (`AssetNotFound`) | **Mismatch** — indexed registration exists but hub registry has no decimals for that `assetId` |
| `address` / `assetTokenId` | Match `idToAsset` |
| `id` | `assetToId` round-trip |
| Spoke view revert (`UnknownAsset`) | **Mismatch** — indexed asset row not registered on spoke |

ERC-6909 (`assetTokenId > 0`): id mapping only; skip ERC-20 `decimals()`.

## Sampling

- **Diverse random** `--sample` per sub-check (registrations + spoke assets), stratified by `assetId` and `centrifugeId`.

## Skip conditions

- Missing hub or spoke RPC.
- Duplicate registration rows — compare against hub `decimals(assetId)` regardless.

## Out of scope

- `name` / `symbol` (off-chain / IPFS).
- Completeness of all registered assets (no global asset iterator on-chain).

## Examples

```bash
pnpm smoke asset --sample 50
```

## Merges

Former standalone [archive/asset-registration.md](./archive/asset-registration.md).
