# 5 — Basin cross-chain reconciliation (Grove Basin)

**Status:** Pass 2 — action path (**Drizzle review:** upsert-computed `state`, not `generatedAlwaysAs`)  
**Risk:** High  

---

## Goal

Basin redeem batches link to spoke `vault:RedeemRequest` and hub `approveRedeems` **regardless of which chain indexes first**; reduce reliance on one-shot warnings.

> **Ponder 0.16.6 blocks `generatedAlwaysAs`** — see [doc 0 §2](./0-ponder-ordering-migration-overview.md). Reconciliation queries should prefer **fact columns**; `state` is a convenience enum recomputed in upsert SET.

---

## Schema changes

### `basin_redeem_request`

**Keep writable `state` enum** — handlers never set it in TS; `upsertFacts` recomputes from facts:

| Fact column | Set by |
|-------------|--------|
| `initiatedAt*` | `RedeemInitiated` (existing) |
| `completedAt*` | `RedeemCompleted` |
| `spokeRedeemRequestedAt*` | `vault:RedeemRequest` link |
| `linkedRedeemOrderIndex` | `approveRedeems` link |

**Schema:**

```ts
state: BasinRedeemRequestState("basin_redeem_request_state").notNull(),
```

**CASE in `upsertFacts` SET** (`spoke_redeem_requested_at` is a link fact, not an input to `state`):

```sql
CASE
  WHEN COALESCE(basin_redeem_request.completed_at, excluded.completed_at) IS NOT NULL
  THEN 'COMPLETED'::basin_redeem_request_state
  WHEN COALESCE(basin_redeem_request.initiated_at, excluded.initiated_at) IS NOT NULL
  THEN 'INITIATED'::basin_redeem_request_state
  ELSE 'INITIATED'::basin_redeem_request_state
END
```

Only `INITIATED` vs `COMPLETED` — acceptable if GraphQL consumers need those two values. `reconcileBasinRedeemLinks` should query `initiated_at` / `spoke_redeem_requested_at` facts, not `state`.

### `basin_swap`

Keep PK `(chainId, txHash, logIndex)`. `basinRedeemRequestId` — upsert link from either:

- `RedeemInitiated` batch sweep, or
- late reconciliation pass (below).

---

## Handler action path

### `groveBasin:Swap`

No change — `insert` + `onConflictDoNothing` (idempotent).

### `groveBasin:RedeemInitiated`

| Today | Pass 2 |
|-------|--------|
| Query swaps `blockNumber_lte` | Keep; add optional `logIndex_lte` if same-tx ordering required |
| `linkSpokeRedeemIfPending` once | **Always** call `reconcileBasinRedeemLinks(context, requestId)` after upsert |

### `vault:RedeemRequest` (basin path)

After existing logic, call `reconcileBasinRedeemLinks` for matching `tokenRedeemer` / open request.

### `batchRequestManager:ApproveRedeems`

After `linkBasinRedeemOrderToEpoch`, call shared reconciler.

### New: `reconcileBasinRedeemLinks`

```ts
// src/helpers/basinReconciliation.ts
export async function reconcileBasinRedeemLinks(context, cfg, requestId?) {
  // 1. Find rows with initiated_at set, null spoke_redeem_requested_at
  // 2. Match vaultRedeemOrder / pending redeem by (tokenId, assetId, redeemer, time window)
  // 3. upsert spokeRedeemRequestedAt* + linkedRedeemOrderIndex when unique match
  // 4. upsert swap.basinRedeemRequestId for unlinked CREDIT_TO_COLLATERAL swaps
  // 5. insert warning only if still ambiguous AFTER upsert attempt
}
```

**Idempotent:** each leg upserts its fact columns; reconciler safe to call from any handler.

### `groveBasin:RedeemCompleted`

| Today | Pass 2 |
|-------|--------|
| Hard fail if `open.length !== 1` | `upsert` `completedAt*` on best-match INITIATED row for `redeemer`; warning if 0 or >1 **after** reconcile |

---

## Warnings table

Keep `basin_reconciliation_warning` as insert-only ops signal. Rate should drop post-reconciler.

---

## GraphQL parity matrix

| Query | Assert |
|-------|--------|
| `basinRedeemRequests { state, linkedRedeemOrderIndex, spokeRedeemRequestedAt }` | Same % linked as omnichain |
| `basinSwaps { basinRedeemRequestId }` | Batch swaps linked |

---

## Files to change

- [`ponder.schema.ts`](../ponder.schema.ts) — basin fact columns + writable `state`
- [`src/handlers/basinHandlers.ts`](../src/handlers/basinHandlers.ts)
- [`src/handlers/vaultHandlers.ts`](../src/handlers/vaultHandlers.ts)
- [`src/handlers/batchRequestManagerHandlers.ts`](../src/handlers/batchRequestManagerHandlers.ts)
- [`src/helpers/basinReconciliation.ts`](../src/helpers/basinReconciliation.ts)

---

## Testing

Permute: `RedeemInitiated` / `RedeemRequest` / `ApproveRedeems` in all 6 orders; links must match omnichain baseline.
