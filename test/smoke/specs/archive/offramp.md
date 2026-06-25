# Smoke: `offramp`

| | |
|--|--|
| **Tier** | 1 |
| **Entities** | `OffRampAddress`, `OnOffRampManager` |
| **Chains** | Spoke |

## Purpose

Verify indexed off-ramp receiver configurations match `IOnOffRamp.offramp(asset, receiver)`.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `OffRampAddress.isEnabled` | `offramp(asset, receiver)` | `IOnOffRamp` at parent manager |

Resolve manager: join via `tokenId` + `centrifugeId` → `OnOffRampManager.address` (same pool/share class as on-ramp).

## GraphQL query

```graphql
query OffRampAddresses($limit: Int!, $after: String, $where: OffRampAddressFilter) {
  offRampAddresses(limit: $limit, after: $after, where: $where) {
    items {
      tokenId
      centrifugeId
      assetAddress
      receiverAddress
      isEnabled
      crosschainInProgress
      poolId
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

Also fetch manager address for `(tokenId, centrifugeId)`.

## RPC calls

```solidity
// IOnOffRamp
function offramp(address asset, address receiver) external view returns (bool);
```

## Comparison

Boolean: `isEnabled === onramp(asset, receiver)`.

## Sampling

- `--sample 100`.
- Prefer `isEnabled: true` rows.

## Skip conditions

- `crosschainInProgress` on row or manager.
- Missing manager for token.
- Missing RPC.

## Known limitations

- Does not probe all receivers like `onramp` probes all assets — only indexed rows (sampled).

## Examples

```bash
pnpm smoke offramp --chain avalanche
```
