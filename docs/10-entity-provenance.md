# 10 — Entity provenance (`createdBy*`)

**Status:** Spec — not implemented  
**Risk:** Medium (schema + full reindex; handler-wide `insertDefaults` change)  
**Depends on:** [3 — Asset & escrow bootstrap](./3-asset-escrow-bootstrap.md), [4 — Vault lifecycle](./4-vault-crosschain-lifecycle.md)  
**Motivation:** v3 → v3_1 migration left legacy rows (e.g. pre-migration `Escrow` on Ethereum) that are valid event history but not comparable to **current** v3_1 deployment views (`BalanceSheet.escrow`, `poolEscrowFactory.escrow`). There is no on-chain “deactivate pool” event. Provenance columns record **which registry stack and emitter contract** created a row so consumers can filter to the current stack without overloading `isActive`.

---

## Goal

Persist immutable **birth provenance** on event-born entities:

| Column | Type | Meaning |
|--------|------|---------|
| `createdByAddress` | `hex` | `event.log.address` — contract that emitted the creating log |
| `createdByContractName` | `text` | Unversioned logical name (e.g. `poolEscrowFactory`, `hubRegistry`) |
| `createdByRegistryVersion` | `text` | Registry version key (e.g. `v3`, `v3_1`) from [`REGISTRY_VERSION_ORDER`](../src/contracts.ts) |

**Rules**

1. Set **only on first insert** (same immutability as `createdAt*`).
2. On `upsert` conflict, **do not** overwrite provenance (mirror `createdAt` / `createdAtBlock` / `createdAtTxHash` exclusion in [`Service.upsert`](../src/services/Service.ts)).
3. Nullable when a row is created without an originating log (`getOrInit` stub, migration seeds, defer-insert).
4. `createdByAddress` is the **emitter**, not necessarily the entity’s primary address (factory-deployed escrows/vaults/managers).

---

## Non-goals

- Replacing `createdAt*` / block attribution (provenance complements, not duplicates).
- A synthetic `isActive = false` with no on-chain meaning (optional **derived** GraphQL field is fine; see below).
- Provenance on pure snapshot tables, join edges without a single birth event, or high-volume investor transaction rows in v1.
- Backfilling provenance without full reindex (historical rows need replay or an explicit one-off migration script).

---

## Problem recap (escrow smoke)

| Source | What it represents |
|--------|-------------------|
| Indexed `Escrow.address` | Last `poolEscrowFactory:DeployPoolEscrow` **for that factory version** |
| `BalanceSheet.escrow(poolId)` on **v3_1** deployment | CREATE2 counterfactual on **current** factory |

Legacy pools may have a **v3** `DeployPoolEscrow` row (contract has code) while v3_1 `balanceSheet.escrow()` points at an **empty** CREATE2 slot. Provenance lets smokes and `getLatest` prefer `createdByRegistryVersion = 'v3_1'` without treating v3 history as a mismatch.

---

## Schema

### Shared column builder

Add to [`ponder.schema.ts`](../ponder.schema.ts) (near `defaultColumns`):

```ts
function provenanceColumns(t: PgColumnsBuilders) {
  return {
    createdByAddress: t.hex(),
    createdByContractName: t.text(),
    createdByRegistryVersion: t.text(),
  };
}
```

All three **nullable** at the DB layer (stubs / pre-reindex).

Optional later: `onchainEnum("registry_version", ["v3", "v3_1"])` when a third registry ships.

### Phase 1 tables (ship together)

| Table | PK / identity | Birth event(s) | `createdByContractName` |
|-------|---------------|----------------|-------------------------|
| `escrow` | `(address, centrifugeId)` | `poolEscrowFactory:DeployPoolEscrow` | `poolEscrowFactory` |
| `pool` | `id` | `hubRegistry:NewPool` | `hubRegistry` |
| `pool_spoke_blockchain` | `(poolId, centrifugeId)` | `hub:NotifyPool` | `hub` |
| `vault` | `(id, centrifugeId)` | `spoke:DeployVault` / `vaultRegistry:DeployVault` | `spoke` or `vaultRegistry` |
| `token` | hub share class row | `shareClassManager:AddShareClass` | `shareClassManager` |
| `token_instance` | `(tokenId, centrifugeId)` | `spoke:AddShareClass` | `spoke` |
| `on_off_ramp_manager` | factory deploy | `onOffRampManagerFactory:DeployOnOfframpManager` | `onOffRampManagerFactory` |

### Phase 2 (follow-up)

`asset` (spoke `RegisterAsset`), `merkle_proof_manager`, `holding_escrow` (first materializing event), `pool_manager` (`hubRegistry:UpdateManager` is update not create — only if split create path exists).

### Indexes (Phase 1)

```text
escrow: (poolId, centrifugeId, createdByRegistryVersion, createdAtBlock DESC)
pool:   (createdByRegistryVersion, isActive)  -- optional analytics
```

Extend existing `poolCentrifugeCreatedIdx` only if query plans need it; prefer composite above for `getLatest` on current stack.

---

## Helper: `provenanceFromEvent`

**New file:** [`src/helpers/provenance.ts`](../src/helpers/provenance.ts)

```ts
import type { Context, Event } from "ponder:registry";
import {
  getContractNameAndVersionForAddress,
  REGISTRY_VERSION_ORDER,
  type RegistryVersions,
} from "../contracts";

export type EntityProvenance = {
  createdByAddress: `0x${string}`;
  createdByContractName: string;
  createdByRegistryVersion: RegistryVersions;
};

/**
 * Derive immutable insert provenance from a Ponder event.
 * @param event - Handler event (must have log.address)
 * @param context - Chain context
 * @param logicalContractName - Unversioned name when known (multiMapper base); else address lookup
 */
export function provenanceFromEvent(
  event: Event,
  context: Context,
  logicalContractName?: string
): EntityProvenance | null {
  const createdByAddress = event.log.address as `0x${string}`;
  const resolved = getContractNameAndVersionForAddress(context.chain.id, createdByAddress);
  if (!resolved) return null;

  const version = REGISTRY_VERSION_ORDER[resolved.versionIndex] as RegistryVersions | undefined;
  if (!version) return null;

  const createdByContractName = logicalContractName ?? resolved.contractName;
  return { createdByAddress, createdByContractName, createdByRegistryVersion: version };
}
```

**Precedence:** when the handler is registered via `multiMapper("poolEscrowFactory:…")`, pass `"poolEscrowFactory"` so the name is stable even if address lookup order changes. When multiple contracts share an address across versions (should not happen on one chain), logical name + address disambiguates.

**Existing pattern:** same family as [`getVersionForContract`](../src/contracts.ts) usage in [`multiAdapterHandlers.ts`](../src/handlers/multiAdapterHandlers.ts) and [`gatewayHandlers.ts`](../src/handlers/gatewayHandlers.ts).

---

## Service layer

### `insertDefaults`

In [`Service.ts`](../src/services/Service.ts), extend `insertDefaults`:

```ts
// Optional 4th arg or options bag — prefer explicit provenance on table rows that have columns:
if ("createdByAddress" in table && provenance) {
  Object.assign(dataWithDefaults, provenance);
}
```

Call sites pass provenance from handlers **or** a thin wrapper:

```ts
Service.upsert(context, { ...payload, ...provenanceFromEvent(event, context, "poolEscrowFactory") }, event);
```

**Alternative (preferred for consistency):** `insertDefaults(table, data, event, { logicalContractName })` auto-merges when table has provenance columns and `event.log.address` resolves.

### `upsert` / `save` conflict sets

In `onConflictDoUpdate.set`, add alongside existing `createdAt: undefined`:

```ts
createdByAddress: undefined,
createdByContractName: undefined,
createdByRegistryVersion: undefined,
```

Same for `save()` instance path if it preserves `createdAt*`.

### `insertMany`

If batch inserts are used for provenance-bearing tables, each row needs the same provenance (same event) or per-row provenance in the batch payload.

---

## Handler action path (Phase 1)

| Handler | Service | `logicalContractName` |
|---------|---------|------------------------|
| [`poolEscrowFactoryHandlers.ts`](../src/handlers/poolEscrowFactoryHandlers.ts) | `EscrowService.upsert` | `poolEscrowFactory` |
| [`hubRegistryHandlers.ts`](../src/handlers/hubRegistryHandlers.ts) `NewPool` | `PoolService.upsert` | `hubRegistry` |
| [`hubHandlers.ts`](../src/handlers/hubHandlers.ts) `NotifyPool` | `PoolSpokeBlockchainService.getOrInit` | `hub` |
| [`vaultRegistryHandlers.ts`](../src/handlers/vaultRegistryHandlers.ts) | `VaultService.upsert` | `vaultRegistry` |
| [`spokeHandlers.ts`](../src/handlers/spokeHandlers.ts) `DeployVault` | `VaultService` | `spoke` |
| [`shareClassManagerHandlers.ts`](../src/handlers/shareClassManagerHandlers.ts) `AddShareClass` | `TokenService` | `shareClassManager` |
| [`spokeHandlers.ts`](../src/handlers/spokeHandlers.ts) `AddShareClass` | `TokenInstanceService` | `spoke` |
| [`onOffRampManagerHandlers.ts`](../src/handlers/onOffRampManagerHandlers.ts) / factory handler | `OnOffRampManagerService` | `onOffRampManagerFactory` |

Handlers that only **update** existing rows do not touch provenance.

### Optional: index `spoke:AddPool`

Not required for provenance on `Escrow` (`newEscrow` emits `DeployPoolEscrow` in the same tx). Useful later for spoke-activation facts without inferring from escrow alone.

---

## Service query semantics

### `EscrowService.getLatest`

Add optional filter to prefer current stack:

```ts
static async getLatest(
  context,
  query: { poolId: bigint; centrifugeId: string },
  opts?: { registryVersion?: RegistryVersions }
): Promise<EscrowService | null>
```

**Default for runtime handlers (post-migration):** `registryVersion: 'v3_1'` when a v3_1 row exists; fall back to newest any version if none (log `serviceWarn` once per pool chain).

**Default for historical integrity / smoke “current stack”:** require `v3_1` or skip.

Implementation: extend `query` with `createdByRegistryVersion` + existing `_sort: [{ field: 'createdAtBlock', direction: 'desc' }]`, or two-step query (v3_1 first, then fallback).

### `Pool` / hub vs spoke

- `Pool.createdByRegistryVersion` reflects **hub** `hubRegistry:NewPool` only.
- Spoke migration status: use `Escrow`, `TokenInstance`, or future `AddPool` — not hub `Pool` alone.
- Do **not** set `Pool.isActive = false` from provenance without a product decision; prefer explicit filters.

---

## Consumers

### Smoke tests

| Smoke | Change |
|-------|--------|
| [`escrow`](../test/smoke/specs/escrow.md) | Compare only rows with `createdByRegistryVersion = 'v3_1'` **or** skip with `legacy-v3-escrow` when no v3_1 row exists |
| [`pool-spoke-presence`](../test/smoke/specs/pool-spoke-presence.md) | Optional: `NotifyPool` provenance `v3` + `isPoolActive` false on v3_1 spoke → warn, not mismatch |
| [`vault`](../test/smoke/specs/vault.md) | Filter to v3_1 `vaultRegistry` / deploy provenance |

### GraphQL (optional Phase 1b)

Expose columns on entities. Optional computed field:

```graphql
isOnCurrentRegistry: Boolean!
# true when createdByRegistryVersion equals latest registry deployed on entity's chain
```

Implement as SQL/GraphQL resolver comparing to max version in `REGISTRY_VERSION_ORDER` (today: `v3_1`).

### Handlers using `EscrowService.getLatest`

[`hubHandlers.ts`](../src/handlers/hubHandlers.ts) (`NotifyAssetPrice`), [`balanceSheetHandlers.ts`](../src/handlers/balanceSheetHandlers.ts), [`spokeHandlers.ts`](../src/handlers/spokeHandlers.ts) — switch to `getLatest(..., { registryVersion: 'v3_1' })` with fallback + warn when resolving escrow for **live** cross-chain work.

---

## Backfill & reindex

1. Ship schema + `pnpm codegen`.
2. Deploy handlers writing provenance on all new inserts.
3. **Full reindex** — no in-place backfill of live rows (same rule as [ordering migration overview](./0-ponder-ordering-migration-overview.md)).

**Reindex validation queries (post-deploy):**

```graphql
# Escrows with null provenance after reindex → bug
escrows(where: { createdByRegistryVersion: null }, limit: 10) { items { address poolId } }

# Legacy v3-only escrows on Ethereum (expected for unmigrated pools)
escrows(
  where: { centrifugeId: "1", createdByRegistryVersion: "v3" }
  limit: 20
) { items { poolId address createdAtBlock } }
```

**Fallback heuristic (debug only, not for production writes):** if `createdAtBlock < V3_1_MIGRATION_BLOCKS[chain]` and emitter resolves to v3 deployment address → infer `v3`. Prefer event replay over heuristics.

---

## Testing

| Test | Assert |
|------|--------|
| `test/unit/parity/entity-provenance.test.ts` (new) | `insertDefaults` / `upsert` preserves provenance on conflict; strips from update set |
| Handler fixture or integration | `poolEscrowFactoryV3_1:DeployPoolEscrow` → row has `createdByRegistryVersion === 'v3_1'` |
| Smoke escrow | Known legacy pool `281474976710657` skipped or filtered, not mismatched |

Run `pnpm typecheck`, `pnpm lint`, `pnpm codegen` after schema edits.

---

## Rollout plan

| Step | Work |
|------|------|
| **A** | `provenanceColumns`, `provenanceFromEvent`, `insertDefaults` + `upsert` preservation |
| **B** | Phase 1 handlers + `EscrowService.getLatest` filter |
| **C** | Smoke + spec updates ([`escrow.md`](../test/smoke/specs/escrow.md), [`_shared.md`](../test/smoke/specs/_shared.md)) |
| **D** | Full reindex staging → prod |
| **E** | GraphQL exposure + optional `isOnCurrentRegistry` |

---

## Files to change (checklist)

- [`ponder.schema.ts`](../ponder.schema.ts) — columns + indexes
- [`src/helpers/provenance.ts`](../src/helpers/provenance.ts) — new
- [`src/services/Service.ts`](../src/services/Service.ts) — insert/upsert
- [`src/services/EscrowService.ts`](../src/services/EscrowService.ts) — `getLatest` filter
- Phase 1 handlers (table above)
- [`test/smoke/checks/escrow.mjs`](../test/smoke/checks/escrow.mjs) — filter/skip
- [`test/smoke/specs/escrow.md`](../test/smoke/specs/escrow.md) — document filter
- [`AGENTS.md`](../AGENTS.md) — key path row (optional)

---

## Open questions

1. **Strict vs fallback `getLatest`:** hard-fail handlers when only v3 escrow exists, or warn-and-use-v3 for unmigrated pools still holding funds?
2. **Enum vs text** for `createdByRegistryVersion` when `v3_2` ships.
3. **Phase 2 scope** — which high-churn tables justify provenance vs query cost.
4. **Product:** expose legacy rows in GraphQL with a filter `where: { createdByRegistryVersion: "v3" }` or hide behind `isOnCurrentRegistry`.

---

## Related

- [3 — Asset & escrow bootstrap](./3-asset-escrow-bootstrap.md) — `EscrowService.getLatest`, factory upsert
- [Spell 006 migration (protocol)](../../cfg-protocol-v3/env/spell/006_migration_v3.1/README.md) — v3_1 `castPool` / `DeployPoolEscrow`
- [`V3_1_MIGRATION_BLOCKS`](../src/config.ts) — per-chain cutover blocks
- [`multiMapper`](../src/helpers/multiMapper.ts) — unversioned event → `ContractV3` / `ContractV3_1`
