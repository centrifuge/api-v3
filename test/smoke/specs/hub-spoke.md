# Hub–spoke multichain rules for smokes

Centrifuge V3 is a **hub + spoke** protocol. Smokes must treat each indexed row as living on a **specific logical network** (`centrifugeId` / local gateway id), not as a single global deployment.

## CREATE3: same address, different chains

Contract addresses are **deterministic across chains** (CREATE3). Examples:

- `OnOffRampManager` at `0x816aa609…` exists on Ethereum, Avalanche, Pharos, …
- Each chain has its **own contract instance and storage** (`onramp`, `escrow`, etc.)

**Implications for smokes:**

| Rule | Why |
|------|-----|
| Always resolve RPC via row `centrifugeId` | `eth_call` must hit the spoke chain where that row was born |
| Never search Etherscan for `manager:asset` alone | Same address on another chain is a different contract |
| Include `centrifugeId` (and ideally chain name) in `entityId` | Disambiguates CREATE3 collisions in reports |
| Skip manager/asset checks when bytecode is empty on that chain | Row may be indexed for a network where the contract is not deployed yet |

`resolveCentrifugeChain(ctx, centrifugeId)` → `{ chainId, client, deployment }` is the canonical wiring ([`_shared.md`](./_shared.md)).

## Hub vs spoke: what to read on-chain

| Domain | Indexed entity | On-chain source of truth | Chain |
|--------|----------------|--------------------------|-------|
| Pool currency/decimals | `Pool` | `HubRegistry` | **Hub** (`Pool.centrifugeId`) |
| Asset registration decimals | `AssetRegistration` | `HubRegistry.decimals(assetId)` | **Hub** |
| Spoke asset id map | `Asset` | `Spoke.idToAsset` / `assetToId` | **Spoke** (`Asset.centrifugeId`) |
| Share token address | `TokenInstance` | `Spoke.shareToken(poolId, scId)` | **Spoke** |
| Pool escrow | `Escrow` | `BalanceSheet.escrow(poolId)` | **Spoke** |
| Vault linkage | `Vault` | `VaultRegistry` / vault contract | **Spoke** |
| On-ramp enabled flag | `OnRampAsset` | `OnOffRamp.onramp(asset)` | **Spoke** (manager's `centrifugeId`) |
| Pool active on spoke | `PoolSpokeBlockchain` | `Spoke.isPoolActive(poolId)` | **Spoke** |
| Local network id | `Deployment` | `Gateway.localCentrifugeId()` | Each deployed network |

**Hub handlers do not mirror spoke storage.** Cross-chain config (on-ramp, off-ramp, vault link, prices) is initiated on the hub and **applied on the spoke** via `trustedCall` / manager events.

## Cross-chain lag (`crosschainInProgress`)

Several entities can be mid-flight while a hub message is in transit. Default `--skip-crosschain` skips indexed rows with `crosschainInProgress` set when comparing **indexed** fields.

For **on-ramp**, the spoke view is still authoritative once `UpdateOnramp` has executed:

- Hub: `hub:UpdateContract` (onramp) → may set `crosschainInProgress` on `OnRampAsset`
- Spoke: `onOffRampManager:UpdateOnramp` → sets `isEnabled` and clears in-progress

Smokes compare `OnRampAsset.isEnabled` to **`OnOffRamp.onramp(asset)` on the manager's spoke chain**, not hub storage.

## On-ramp smoke (per spoke manager row)

`OnOffRampManager` primary key is `(address, centrifugeId)`. One physical address yields **one smoke pass per indexed spoke row**:

1. Resolve RPC for `manager.centrifugeId`
2. Probe **only** `Asset` rows with the same `centrifugeId` (spoke-local ERC-20 set)
3. `eth_call` `onramp(asset)` on `manager.address` **on that chain**
4. Compare to `OnRampAsset` rows for `(tokenId, centrifugeId, assetAddress)`

A manager indexed on Ethereum + Avalanche runs **two independent checks**; `onramp(asset)` may differ per chain.

## Escrow smoke (v3_1 canonical view)

On v3_1 spokes, `BalanceSheet.escrow(poolId)` delegates to `PoolEscrowFactory.escrow(poolId)` — the **current** CREATE2 counterfactual for that pool.

For **migrated** pools, indexed `Escrow.address` (newest `DeployPoolEscrow` per `centrifugeId`) must match that view. A mismatch where the index still shows a v3-era deploy while on-chain points at a different v3_1 slot is **not** ignored: investigate missing `poolEscrowFactory:DeployPoolEscrow` on the v3_1 factory (indexed via static `PoolEscrowFactory`, not factory-child discovery), wrong `getLatest` row, or incomplete on-chain migration.

Historical v3 escrow rows may remain in the DB for audit; the smoke compares **latest row per `(poolId, centrifugeId)`** against live `BalanceSheet.escrow()`. Provenance columns ([docs/10-entity-provenance.md](../../../docs/10-entity-provenance.md)) will later make stack filtering explicit in GraphQL.

## Same-chain hub + spoke

On networks like Ethereum (`centrifugeId` 1), hub and spoke contracts coexist on the **same EVM chain id**. Smokes still distinguish them by **which contract** they read (`hubRegistry` vs `spoke` / `balanceSheet`), not by assuming a separate chain id.

## Ponder factory-child caveat

Spoke managers, vaults, and escrows are discovered via Ponder **factory** mappings. Missing child events while parent factory deploy rows exist is a known Ponder sync issue — see [AGENTS.md § Ponder factory discovery](../../../AGENTS.md#ponder-factory-discovery-cache-bug-pinned-ponder0166). Attribute missing **spoke child** state to that before handler bugs, e.g.:

- `OnRampAsset` missing while `UpdateOnramp` exists on the manager (factory-child subscription)
