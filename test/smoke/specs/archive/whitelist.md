# Smoke: `whitelist`

| | |
|--|--|
| **Tier** | 2 |
| **Entities** | `WhitelistedInvestor`, `TokenInstance` |
| **Chains** | Spoke |

## Purpose

Verify transfer restriction memberlist/freeze state for indexed whitelisted investors against the share token's transfer hook.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `WhitelistedInvestor.isFrozen` | `isFrozen(token, user)` | Transfer hook |
| `WhitelistedInvestor.validUntil` | `isMember(token, user).validUntil` | Transfer hook |

## GraphQL query

```graphql
query WhitelistedInvestors($limit: Int!, $after: String, $where: WhitelistedInvestorFilter) {
  whitelistedInvestors(limit: $limit, after: $after, where: $where) {
    items {
      tokenId
      centrifugeId
      accountAddress
      isFrozen
      validUntil
      tokenInstance { address }
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
// ShareToken
function hook() external view returns (address);

// IBaseTransferHook / IFreezable / IMemberlist
function isFrozen(address token, address user) external view returns (bool);
function isMember(address token, address user) external view returns (bool isValid, uint64 validUntil);
```

Flow: `shareToken.hook()` → call hook with `token = shareToken.address`.

## Comparison

| Field | Rule |
|-------|------|
| `isFrozen` | Boolean exact |
| `validUntil` | Unix timestamp exact (GraphQL timestamp ↔ `uint64`) |

Member validity: if indexer stores whitelist row, expect `isValid == true` unless frozen-only rows exist.

## Sampling

- Usually small set — may run all rows under `--sample 0` cap 500.
- `--token-id` filter.

## Skip conditions

- `hook()` is zero address (freely transferable token).
- Hook does not implement `isMember` (freeze-only hook) — skip `validUntil`, check freeze only.
- Missing RPC.

## Known limitations

- V2 migration seed rows may not match on-chain hook if hook upgraded.
- Full memberlist enumeration not performed — only indexed investors.

## Examples

```bash
pnpm smoke whitelist --token-id 0x... --chain plume
```
