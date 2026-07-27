# Smoke: `ward`

| | |
|--|--|
| **Tier** | 1 |
| **Entities** | `SmartContractWard` |
| **Chains** | Per `fromChainId` / `toChainId` |

## Purpose

Verify indexed Auth ward relationships: `SmartContractWard.isActive` matches `wards(toAddress)` on the granting contract.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `SmartContractWard.isActive` | `wards(toAddress) == 1` | `IAuth` at `fromAddress` on `fromChainId` |

## GraphQL query

```graphql
query SmartContractWards($limit: Int!, $after: String, $where: SmartContractWardFilter) {
  smartContractWards(limit: $limit, after: $after, where: $where) {
    items {
      fromChainId
      fromAddress
      toChainId
      toAddress
      isActive
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
// IAuth
function wards(address target) external view returns (uint256);
```

Active when return value `=== 1n`.

## Comparison

| Indexed `isActive` | On-chain `wards` |
|------------------|------------------|
| `true` | `=== 1` |
| `false` | `=== 0` |

## Sampling

- Prefer `isActive: true` (ward grants).
- `--sample 100`.

## Skip conditions

- `fromChainId !== toChainId` — only check same-chain wards unless cross-chain ward pattern documented (typically same chain).
- Missing RPC for `fromChainId`.
- `fromAddress` has no code.

## Known limitations

- Only samples indexed ward rows, not full on-chain ward enumeration.
- Does not verify `Rely`/`Deny` event ordering.

## Examples

```bash
pnpm smoke ward --sample 50 --mismatches-only
```
