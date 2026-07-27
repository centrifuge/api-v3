# Smoke: `asset-registration`

| | |
|--|--|
| **Tier** | 1 |
| **Entities** | `AssetRegistration` |
| **Chains** | Hub (`centrifugeId = "1"`) |

## Purpose

Verify hub-side asset registration decimals match `HubRegistry.decimals(assetId)`.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `AssetRegistration.decimals` | `decimals(AssetId)` | `HubRegistry` on hub deployment |

## GraphQL query

```graphql
query AssetRegistrations($limit: Int!, $after: String) {
  assetRegistrations(limit: $limit, after: $after, orderBy: "assetId", orderDirection: "asc") {
    items {
      assetId
      centrifugeId
      decimals
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
// IHubRegistry
function decimals(AssetId assetId) external view returns (uint8);
```

Use hub chain RPC (`centrifugeId` "1" / Ethereum mainnet deployment).

## Comparison

Exact match on `decimals` (0 tolerance).

## Sampling

- Default `--sample 100` on `assetRegistrations`.
- Hub filter implicit.

## Skip conditions

- Row `centrifugeId` !== hub centrifuge id.
- Missing hub RPC.
- `decimals()` reverts for unknown assetId — mismatch.

## Known limitations

- Does not verify `isRegistered` flag separately if decimals reverts handle unregistered case.
- Does not cross-check spoke `Asset` row (see `asset` smoke).

## Examples

```bash
pnpm smoke asset-registration --sample 200
```
