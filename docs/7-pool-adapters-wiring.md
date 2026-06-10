# 7 — Pool adapters & adapter wiring

**Status:** Pass 2 — action path  
**Risk:** Medium  
**Depends on:** [1](./1-crosschain-messaging.md), [2](./2-hub-spoke-crosschain-state.md)

---

## Goal

`pool_adapter` rows and `adapter_wiring` reflect final on-chain state when `SetPoolAdapters` message, `SetAdapters` event, or `File` indexing happen in any order.

---

## Schema

### `pool_adapter`

Apply hub/spoke signal pattern ([doc 2](./2-hub-spoke-crosschain-state.md)):

- `hubSignalType`: `Enabled` | `Disabled` (maps from message intent)
- `hubSignalAt*`, `spokeAckAt*`
- Generated `crosschainInProgress` (same SQL as vault)
- Writable `isEnabled` — set **only** by `multiAdapter:SetAdapters` (authoritative)

### `adapter_wiring`

Add facts:

| Column | Set by |
|--------|--------|
| `wiredAt*` | `multiAdapter:File` |

**Upsert** on `(fromAddress, fromCentrifugeId, toAddress, toCentrifugeId)` — create when both adapters exist.

---

## Handler action path

### `gateway:PrepareMessage` (SetPoolAdapters decode)

| Today | Pass 2 |
|-------|--------|
| `setCrosschainInProgressFromMessage` | **`PoolAdapterService.upsertHubSignal`** per adapter address in message — no require existing rows |
| | Insert stub `pool_adapter` rows with `isEnabled: false` + hub signal |

### `multiAdapter:SetAdapters`

| Today | Pass 2 |
|-------|--------|
| `syncFromSetAdapters` | Keep authoritative `isEnabled` sync + **`upsertSpokeAck`** on all touched rows |
| | Remove direct `setCrosschainInProgress()` clears — `upsertSpokeAck` + CASE in SET handles |

### `gateway:FailMessage`

| Today | Pass 2 |
|-------|--------|
| `clearCrosschainInProgress` | **`upsertSpokeAck`** with `spokeAckAt = failedAt` OR dedicated `hubSignalCancelledAt*` fact |

Use `hubSignalCancelledAt` if ack semantics blur:

```ts
hubSignalCancelledAt: t.timestamp(),
```

Generated in-progress:

```sql
WHEN hub_signal_at IS NOT NULL
 AND hub_signal_cancelled_at IS NULL
 AND (spoke_ack_at IS NULL OR spoke_ack_at < hub_signal_at)
```

### `multiAdapter:File`

| Today | Pass 2 |
|-------|--------|
| Skip if remote adapter missing | **`upsert` deferred wiring**: insert row with `wiredAt` null + `pendingRemoteAdapter` address; reconciler completes when `Adapter` exists |
| | New `reconcileAdapterWiring(context, remoteCentrifugeId)` called from `multiAdapter:setup` and after each `Adapter` upsert |

---

## New reconciler

```ts
// AdapterWiringService.reconcilePending(context)
// SELECT pending rows WHERE remote adapter now exists → set wiredAt*
```

Call from:

- `setupHandlers` `multiAdapter:setup`
- end of `AdapterService.upsert`

---

## GraphQL parity matrix

| Query | Assert |
|-------|--------|
| `poolAdapters { isEnabled, crosschainInProgress }` | Match omnichain during/after SetAdapters |
| `adapterWirings` | Same edges |

---

## Files to change

- [`ponder.schema.ts`](../ponder.schema.ts)
- [`src/handlers/gatewayHandlers.ts`](../src/handlers/gatewayHandlers.ts) — PrepareMessage, FailMessage
- [`src/handlers/multiAdapterHandlers.ts`](../src/handlers/multiAdapterHandlers.ts)
- [`src/services/PoolAdapterService.ts`](../src/services/PoolAdapterService.ts)
- [`src/services/AdapterWiringService.ts`](../src/services/AdapterWiringService.ts)
- [`src/handlers/setupHandlers.ts`](../src/handlers/setupHandlers.ts)
