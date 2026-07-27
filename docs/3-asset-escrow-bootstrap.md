# 3 — Asset registration & escrow bootstrap

**Status:** Pass 2 — action path  
**Risk:** High  

---

## Goal

Asset and escrow rows materialize via **upserts from any chain first**; downstream handlers never hard-fail on missing registration.

---

## Schema changes

### `asset`

No generated status needed. Optional additive facts:

| Column | Purpose |
|--------|---------|
| `registeredOnSpokeAt*` | set by `spoke:RegisterAsset` |
| `registeredOnHubAt*` | set by `hubRegistry:NewAsset` |

**Keep** `getByToken` “newest by `createdAtBlock`” for duplicate `(centrifugeId, address, assetTokenId)` — deterministic per chain; document in API.

### `asset_registration`

Already upsert — no change.

### `escrow`

`poolEscrowFactory:DeployPoolEscrow` — already `upsert`. Add index on `(poolId, centrifugeId, createdAtBlock DESC)` for `getLatest` (schema index only).

---

## Handler action path

### `spoke:RegisterAsset`

| Today | Pass 2 |
|-------|--------|
| `AssetService.upsert` | **Keep** — idempotent on `id` (assetId) |
| Duplicate warning | Keep `serviceWarn`; both rows retained |

### `hubRegistry:NewAsset`

| Today | Pass 2 |
|-------|--------|
| `AssetRegistrationService.upsert` | Keep |
| ISO `getOrInit` asset | `upsert` with `registeredOnHubAt*` |

### `spoke:UpdateAssetPrice` / `balanceSheet:*` / `hub:NotifyAssetPrice`

| Today | Pass 2 |
|-------|--------|
| Hard fail missing asset/escrow | **Escrow:** `upsert` from `poolEscrowFactory` only; if missing, `upsert` placeholder escrow `{ poolId, centrifugeId, address: event-derived or zero }` OR skip amount fields and only write when `DeployPoolEscrow` arrives |
| | **Asset:** `upsert` stub `{ id: assetId }` from event when `assetId` known; for token lookup path use `upsert` from `RegisterAsset` keys |

**Preferred pattern:** extract `ensureAssetByToken` / `ensureEscrowLatest` service helpers that **always upsert** minimal row:

```ts
await AssetService.upsertByToken(context, { centrifugeId, address, assetTokenId, ...fromEvent }, event);
await EscrowService.upsertLatest(context, { poolId, centrifugeId, address }, event);
```

### `hub:NotifyAssetPrice`

Combine with [2-hub-spoke](./2-hub-spoke-crosschain-state.md): upsert `holding_escrow` + `hubSignal*` without requiring escrow row (use `escrowAddress` from `getLatest` or placeholder until deploy).

---

## `EscrowService.getLatest`

| Today | Pass 2 |
|-------|--------|
| Query + sort | Keep — read-only; if empty, caller upserts via factory event |

Do not use `get` without sort.

---

## GraphQL parity matrix

| Query | Assert |
|-------|--------|
| `assets { id, address, assetTokenId, centrifugeId }` | Same count per pool after reindex |
| `holdingEscrows { asset { id } }` | Relation resolves for all priced escrows |
| `vaults { assetId }` | Deploy after register — no null assetId on active vaults |

---

## Files to change

- [`src/handlers/spokeHandlers.ts`](../src/handlers/spokeHandlers.ts)
- [`src/handlers/hubRegistryHandlers.ts`](../src/handlers/hubRegistryHandlers.ts)
- [`src/handlers/balanceSheetHandlers.ts`](../src/handlers/balanceSheetHandlers.ts)
- [`src/handlers/poolEscrowFactoryHandlers.ts`](../src/handlers/poolEscrowFactoryHandlers.ts)
- [`src/services/AssetService.ts`](../src/services/AssetService.ts) — `upsertByToken`
- [`src/handlers/hubHandlers.ts`](../src/handlers/hubHandlers.ts) — NotifyAssetPrice

---

## Testing

Permute: `RegisterAsset` after `DeployVault` / `UpdateAssetPrice` / `NewAsset` — final rows must match omnichain order baseline.
