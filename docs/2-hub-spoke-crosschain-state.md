# 2 — Hub ↔ spoke cross-chain state (`crosschainInProgress`)

**Status:** Pass 2 — action path (**Drizzle review:** upsert-computed enum, not `generatedAlwaysAs`)  
**Risk:** High  
**Depends on:** [1-crosschain-messaging](./1-crosschain-messaging.md) for message-correlated intents (optional phase B2)

---

## Goal

Replace handler-mutated `crosschainInProgress` enums with **same-row signal facts** + **upsert-computed** `crosschainInProgress` so hub and spoke handlers can run in any order without stale or missing in-progress flags.

> **Ponder 0.16.6 blocks `generatedAlwaysAs`** — same pivot as [doc 0 §2](./0-ponder-ordering-migration-overview.md) and [doc 1 § A0](./1-crosschain-messaging.md#a0-spike-gate). Keep `crosschainInProgress` a **writable** enum; recompute in `upsertFacts` SET.

---

## Pattern (all affected entities)

For each table with `crosschainInProgress` today:

| Writable fact (handlers) | Type |
|--------------------------|------|
| `hubSignalType` | same enum as current `crosschainInProgress` |
| `hubSignalAt`, `hubSignalAtBlock`, `hubSignalAtTxHash`, `hubSignalAtChainId` | hub event |
| `spokeAckAt`, `spokeAckAtBlock`, `spokeAckAtTxHash`, `spokeAckAtChainId` | spoke completion event |

**Schema:** writable enum (handlers never set it in TS):

```ts
crosschainInProgress: VaultCrosschainInProgress("vault_crosschain_in_progress"),
```

**CASE in `upsertFacts` SET** (same-row only; snake_case in raw SQL):

```sql
CASE
  WHEN COALESCE(vault.hub_signal_at, excluded.hub_signal_at) IS NOT NULL
   AND (
     COALESCE(vault.spoke_ack_at, excluded.spoke_ack_at) IS NULL
     OR COALESCE(vault.spoke_ack_at, excluded.spoke_ack_at)
        < COALESCE(vault.hub_signal_at, excluded.hub_signal_at)
   )
  THEN COALESCE(excluded.hub_signal_type, vault.hub_signal_type)
  ELSE NULL
END
```

Both columns must use the **same** `onchainEnum` per entity. Result is nullable (current columns have no `.notNull()`).

**Semantics:**

- Hub signals pending update until spoke ack with `spoke_ack_at >= hub_signal_at`.
- Spoke completes before hub → `NULL` (live state already updated on spoke).
- Hub re-signals after ack → new `hub_signal_at` > `spoke_ack_at` → in-progress again.

**Handlers:** `upsertFacts` with **only** fact columns for their side + derived `crosschainInProgress` in SET; never call `setCrosschainInProgress()`. Never `saveMany` on these entities.

---

## Entity mapping

| Table | Hub handler sets | Spoke handler clears (`spokeAck*`) |
|-------|------------------|-----------------------------------|
| `vault` | `hub:UpdateVault` → `hubSignalType` Link/Unlink | `spoke:LinkVault`, `UnlinkVault`, `vaultRegistry:*` |
| `holding_escrow` | `hub:NotifyAssetPrice` | `spoke:UpdateAssetPrice` |
| `token_instance` | `hub:NotifySharePrice` | `spoke:UpdateSharePrice` |
| `pool_manager` | `hub:UpdateBalanceSheetManager` | `balanceSheet:UpdateManager` |
| `policy` | `hub:UpdateContract` (Merkle) | `merkleProofManager:UpdatePolicy` |
| `on_ramp_asset` | `hub:UpdateContract` (onramp) | `onOfframpManager:UpdateOnramp` |
| `off_ramp_relayer` | hub onramp relayer | `onOfframpManager:UpdateRelayer` |
| `off_ramp_address` | hub offramp | `onOfframpManager:UpdateOfframp` |
| `pool_adapter` | `PrepareMessage` SetPoolAdapters intent | `multiAdapter:SetAdapters` |

See [7-pool-adapters-wiring.md](./7-pool-adapters-wiring.md) for `pool_adapter` signal types (`Enabled` / `Disabled`).

---

## Hub handler changes

### `hub:NotifyAssetPrice` / `NotifySharePrice`

| Today | Pass 2 |
|-------|--------|
| Soft skip if escrow/token missing | **`upsert`** `holding_escrow` / `token_instance` with `hubSignal*` only; omit price fields |
| `getOrInit` + `setCrosschainInProgress` | `HoldingEscrowService.upsertHubSignal(context, event, keys, type)` |

### `hub:UpdateVault`

| Today | Pass 2 |
|-------|--------|
| `getOrInit(deferInsert)` stub | `upsert` vault row minimal PK fields + `hubSignal*` |
| Skip Deploy kind | unchanged |

### `hub:UpdateContract` branches

Replace `setCrosschainInProgress` with `upsertHubSignal` on target entity. **Remove hard fails** for missing `tokenInstance` / `vault` / `asset` — upsert stub + signal; spoke completion fills data.

### `hub:UpdateBalanceSheetManager`

`upsert` `pool_manager` + `hubSignalType` = `CanManage` / `CanNotManage`.

---

## Spoke handler changes

On completion events, **`upsert` `spokeAck*`** only (plus domain fields: price, status, policy root, etc.):

```ts
await VaultService.upsertFacts(context, { id, centrifugeId }, {
  status: "Linked",
  spokeAckAt: blockTime,
  spokeAckAtChainId: context.chain.id,
  ...
}, event);
```

Remove all `.setCrosschainInProgress()` / `.setCrosschainInProgress()` clear calls.

### `syncManagerHandlers`

| Today | Pass 2 |
|-------|--------|
| Soft skip if vault/token missing | `upsert` + `spokeAck*` when entity exists OR upsert minimal vault/token stub from event args |

---

## `vault.crosschainInProgressValue`

Keep as writable fact set only by hub `UpdateContract` maxReserve path; not generated. Spoke `SetMaxReserve` writes `maxReserve` + `spokeAck*`.

---

## Service cleanup

Delete methods:

- `VaultService.setCrosschainInProgress`
- `HoldingEscrowService.setCrosschainInProgress`
- `TokenInstanceService.setCrosschainInProgress`
- (same for pool manager, policy, ramp entities)

Add:

- `upsertHubSignal(event, type)`
- `upsertSpokeAck(event)`

---

## GraphQL parity matrix

| Query | Assert |
|-------|--------|
| `vault(id, centrifugeId) { crosschainInProgress, status }` | During in-flight link: `Link`; after `LinkVault`: `null` |
| `holdingEscrows { crosschainInProgress }` | NotifyAssetPrice → UpdateAssetPrice cycle |
| `tokenInstances { crosschainInProgress }` | NotifySharePrice → UpdateSharePrice |

Run with permuted hub/spoke event order in integration tests.

---

## Files to change

- [`ponder.schema.ts`](../ponder.schema.ts) — signal facts + writable `crosschainInProgress` on 9 tables
- [`src/handlers/hubHandlers.ts`](../src/handlers/hubHandlers.ts)
- [`src/handlers/spokeHandlers.ts`](../src/handlers/spokeHandlers.ts)
- [`src/handlers/syncManagerHandlers.ts`](../src/handlers/syncManagerHandlers.ts)
- [`src/handlers/balanceSheetHandlers.ts`](../src/handlers/balanceSheetHandlers.ts)
- [`src/handlers/merkleProofManagerHandlers.ts`](../src/handlers/merkleProofManagerHandlers.ts)
- [`src/handlers/onOffRampManagerHandlers.ts`](../src/handlers/onOffRampManagerHandlers.ts)
- Entity `*Service.ts` files listed above

---

## Migration note

Full reindex required. GraphQL enum field names unchanged; internal columns `hub_signal_*` / `spoke_ack_*` are implementation detail.

> **Unverified:** hiding fact columns from GraphQL via Ponder column config — treat as wishful until codegen proves otherwise on 0.16.6.
