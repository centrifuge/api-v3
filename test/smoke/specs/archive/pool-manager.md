# Smoke: `pool-manager`

| | |
|--|--|
| **Tier** | 1 |
| **Entities** | `PoolManager` |
| **Chains** | Hub (hub manager) + Spoke (balance sheet manager) |

## Purpose

Verify manager permission flags against `HubRegistry.manager` (hub) and `BalanceSheet.manager` (spoke).

## Fields under test

| GraphQL | On-chain | Contract | Chain |
|---------|----------|----------|-------|
| `PoolManager.isHubManager` | `manager(poolId, address)` | `HubRegistry` | Hub |
| `PoolManager.isBalancesheetManager` | `manager(poolId, address)` | `BalanceSheet` | Spoke |

## GraphQL query

```graphql
query PoolManagers($limit: Int!, $after: String, $where: PoolManagerFilter) {
  poolManagers(limit: $limit, after: $after, where: $where) {
    items {
      address
      centrifugeId
      poolId
      isHubManager
      isBalancesheetManager
      crosschainInProgress
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
// IHubRegistry (hub)
function manager(PoolId poolId, address who) external view returns (bool);

// IBalanceSheet (spoke)
function manager(PoolId poolId, address manager) external view returns (bool);
```

For hub manager rows, use hub deployment; for balance sheet manager, use spoke deployment at `centrifugeId`.

## Comparison

Boolean exact per flag. Only check flags that are `true` on indexed row **or** check both directions:

- If `isHubManager`: must match hub registry.
- If `isBalancesheetManager`: must match balance sheet on spoke.

Also verify `false` flags when on-chain returns `true` (orphan permission).

## Sampling

- `--sample 100`.
- Prefer rows with at least one flag true.

## Skip conditions

- `crosschainInProgress` (`CanManage` / `CanNotManage`).
- Missing hub or spoke RPC as required per flag.

## Known limitations

- Gateway-level `manager(poolId, who)` not checked.

## Examples

```bash
pnpm smoke pool-manager --pool-id 281474976710671
```
