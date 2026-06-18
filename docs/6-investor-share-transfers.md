# 6 — Investor cross-chain share transfers

**Status:** Pass 2 — action path  
**Risk:** Medium  
**Depends on:** [1-crosschain-messaging](./1-crosschain-messaging.md) for optional message correlation

---

## Goal

Investor transaction rows and positions stay consistent when `InitiateTransferShares` (source) and destination `Transfer` index in either order.

---

## Schema

### `investor_transaction`

Add optional correlation facts (nullable):

| Column | Set by |
|--------|--------|
| `transferMessageId` | `InitiateTransferShares` (compute same `getMessageId` as gateway) |
| `transferLeg` | `OUT` / `IN` enum |
| `fromCentrifugeId`, `toCentrifugeId` | initiation |

PK unchanged — append-only per event.

### No generated columns required

Transfer type derived from existing `type` field.

---

## Handler action path

### `spoke:InitiateTransferShares`

| Today | Pass 2 |
|-------|--------|
| `transferOut` + `transferIn` immediately | **Keep both upserts** — add `transferMessageId` |
| | If destination `Transfer` already indexed, positions already updated — investor txs still valid historical record |

### `tokenInstance:Transfer` (cross-chain mint/burn)

Detect cross-chain transfer when `from`/`to` involves bridge escrow or known bridge addresses OR when matching `transferMessageId` via pending investor tx:

| Today | Pass 2 |
|-------|--------|
| Standard position update | **Keep** per-chain ordering |
| | `upsert` investor `transferIn`/`transferOut` if initiation not seen yet (stub with `toCentrifugeId` from config) |

### Gateway `ExecuteTransferShares`

When [doc 1](./1-crosschain-messaging.md) upserts message facts, optional hook: `InvestorTransactionService.reconcileTransferMessage(messageId)` links orphan txs.

---

## Service changes

`InvestorTransactionService.transferIn/Out` → use `insert` + `onConflictDoNothing` on natural key `(poolId, tokenId, account, type, createdAtTxHash, logIndex)` if not already — **verify PK**; else idempotent insert.

Add `reconcileTransferMessage(messageId)` — read-only match + update correlation column.

---

## GraphQL parity matrix

| Query | Assert |
|-------|--------|
| `investorTransactions(filter: { type: TRANSFER })` | Same rows ± correlation id |
| `tokenInstancePositions` | Balances match omnichain for bridge investors |

---

## Files to change

- [`src/handlers/spokeHandlers.ts`](../src/handlers/spokeHandlers.ts)
- [`src/handlers/tokenInstanceHandlers.ts`](../src/handlers/tokenInstanceHandlers.ts)
- [`src/services/InvestorTransactionService.ts`](../src/services/InvestorTransactionService.ts)
- [`ponder.schema.ts`](../ponder.schema.ts) — optional correlation columns

---

## Testing

Cross-chain transfer between two indexed spokes; permute initiation vs destination mint.
