# 4 — Vault cross-chain lifecycle

**Status:** Pass 2 — action path  
**Risk:** High  
**Depends on:** [2](./2-hub-spoke-crosschain-state.md), [3](./3-asset-escrow-bootstrap.md)

---

## Goal

Vault deploy / link / unlink reachable regardless of whether hub intent or spoke execution indexes first.

---

## Schema

`vault` table — apply hub/spoke signal pattern from [doc 2](./2-hub-spoke-crosschain-state.md):

- Generated `crosschainInProgress` from `hubSignal*` / `spokeAck*`
- Writable: `status`, `kind`, `maxReserve`, `isActive`, factory fields, etc.

No PK change: `(id, centrifugeId)`.

---

## Handler action path

### `deployVault` (`spoke` + `vaultRegistry`)

| Today | Pass 2 |
|-------|--------|
| Hard fail if asset missing | `AssetService.upsertByTokenForVault` stub from `assetAddress` + event, then merge on `RegisterAsset` |
| `VaultService.upsert` | Keep — full vault row; set `spokeAck*` if completing pending link is N/A on deploy |

### `linkVault` / `unlinkVault`

| Today | Pass 2 |
|-------|--------|
| Hard fail if vault missing | **`VaultService.upsert`** minimal `{ id, centrifugeId, poolId?, tokenId?, assetId? }` from event + set `status` + `spokeAck*` |
| `setCrosschainInProgress()` clear | Use `spokeAck*` facts only |

### `hub:UpdateVault`

| Today | Pass 2 |
|-------|--------|
| `getOrInit(deferInsert)` | `upsert` + `hubSignal*` (Link/Unlink) |

### `vaultHandlers` (invest/redeem)

| Today | Pass 2 |
|-------|--------|
| Hard fail missing vault | **Keep hard fail** — per-chain OK once vault exists on that chain; vault events only fire after deploy on same chain |
| | Optional: `serviceLog` + return only for pre-deploy stray events (should not exist on-chain) |

### `syncManager:SetMaxReserve`

Replace soft skip with `upsert` vault stub + domain fields + `spokeAck*`.

---

## GraphQL parity matrix

| Query | Assert |
|-------|--------|
| `vaults(where: { poolId }) { status, crosschainInProgress, kind }` | Linked pools match |
| `vaultInvestOrders` / `vaultRedeemOrders` | Unchanged if vault exists |

---

## Files to change

- [`src/handlers/vaultRegistryHandlers.ts`](../src/handlers/vaultRegistryHandlers.ts)
- [`src/handlers/hubHandlers.ts`](../src/handlers/hubHandlers.ts) — UpdateVault
- [`src/handlers/spokeHandlers.ts`](../src/handlers/spokeHandlers.ts) — link/unlink
- [`src/handlers/syncManagerHandlers.ts`](../src/handlers/syncManagerHandlers.ts)
- [`src/services/VaultService.ts`](../src/services/VaultService.ts)

---

## Testing

Sequences: `LinkVault` before `UpdateVault`; `DeployVault` before `RegisterAsset` (with stub asset); full parity vs omnichain vault list.
