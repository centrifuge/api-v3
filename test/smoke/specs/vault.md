# Smoke: `vault`

| | |
|--|--|
| **Tier** | Core |
| **Mode** | Correctness |
| **Entities** | `Vault` |
| **Chains** | Spoke |

## Purpose

Verify vault linkage and asset mapping against `VaultRegistry.vaultDetails` / `isLinked`.

## Fields under test

| GraphQL | On-chain | Contract |
|---------|----------|----------|
| `Vault.status` | `isLinked(vault)` | `VaultRegistry` |
| `Vault.assetId` | `vaultDetails(vault).assetId` | `VaultRegistry` |
| `Vault.assetAddress` | `vaultDetails(vault).asset` | `VaultRegistry` |

**Status mapping:**

| On-chain | GraphQL `Vault.status` |
|----------|------------------------|
| `isLinked == true` | `Linked` |
| `isLinked == false` | `Unlinked` |

Skip rows in `LinkInProgress` / `UnlinkInProgress` when `crosschainInProgress` set.

## GraphQL query

```graphql
query Vaults($limit: Int!, $after: String, $where: VaultFilter) {
  vaults(limit: $limit, after: $after, where: $where) {
    items {
      id
      centrifugeId
      status
      assetId
      assetAddress
      poolId
      tokenId
      crosschainInProgress
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

## RPC calls

```solidity
// IVaultRegistry
function vaultDetails(IVault vault) external view returns (VaultDetails memory);
function isLinked(IVault vault) external view returns (bool);
```

`VaultDetails`: `assetId`, `asset`, `tokenId`, `isLinked`, etc.

## Comparison

| Field | Rule |
|-------|------|
| `assetId` | BigInt match |
| `assetAddress` | Address match |
| `status` | Enum per table above |

## Sampling

- **Diverse random** `--sample` across `poolId` and `centrifugeId`; prefer `status: Linked` in candidate buffer.

## Skip conditions

- `crosschainInProgress` in `Deploy`, `Link`, `Unlink`.
- Missing spoke RPC.

## Known limitations

- `Vault.manager` not checked here (set at deploy via eth_call in handler).
- `maxReserve` in `sync-max-reserve` smoke.

## Examples

```bash
pnpm smoke vault --chain base --sample 30
```
