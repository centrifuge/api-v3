# 8 — Within-chain ordering sensitivities

**Status:** Pass 2 — action path  
**Risk:** Medium (regression guard during migration)

---

## Goal

Confirm same-chain flows stay correct under multichain; apply upsert hardening where `count()` or missing-entity hard fails are unnecessary.

---

## No schema changes required

Multichain preserves per-chain EVM log order. This phase is **handler audit + tests**.

---

## Action items

### 1. `shareClassManager:AddShareClass`

| Today | Pass 2 |
|-------|--------|
| Hard fail if pool missing | `PoolService.upsert` stub from `poolId` + `centrifugeId` on short AddShareClass, or `upsert` token with deferred pool relation |

Prefer: keep hard fail — pool **must** exist on same chain from `NewPool` in normal flow; add integration test as control.

### 2. `batchRequestManager` epoch handlers

| Today | Pass 2 |
|-------|--------|
| `EpochInvestOrder not found` hard fail | `EpochInvestOrderService.getOrInit` / `upsert` from event `epochIndex` **before** mutate |
| Same for redeem epoch | |

Replace error paths with upsert-then-update for epoch aggregate rows.

### 3. `tokenInstance:Transfer`

Each `Transfer` log is applied immediately via `TokenInstanceService.applyTransfer`. Mint/burn legs update `totalIssuance`; user-facing legs update positions and investor transactions. Known external DeFi contracts (Uniswap routers, etc.) are listed in `src/config/ignoredTransferAddresses.ts`, seeded into `protocolAddresses`, and excluded from investor position tracking via `isUserAccount`. **Full reindex required** after deploy.

### 4. `balanceSheet` + same-block escrow

Document: Ponder processes logs in order within block. Add fixture test if `DeployPoolEscrow` and `NoteDeposit` same tx.

### 5. Remove remaining `count()` for business identity

Audit grep `count(context` in handlers — replace with event-supplied indices only (epoch index, batch index from [doc 1](./1-crosschain-messaging.md)).

---

## GraphQL parity matrix (control)

| Flow | Chains | Assert |
|------|--------|--------|
| Async vault invest full cycle | single spoke | orders + epochs |
| Hub batch approve/issue/claim | hub only | epoch tables |
| Token transfer + checkpoint | single spoke | position + checkpoints |

Must be **identical** omnichain vs multichain — any diff indicates accidental cross-chain coupling.

---

## Files to audit

- [`src/handlers/shareClassManagerHandlers.ts`](../src/handlers/shareClassManagerHandlers.ts)
- [`src/handlers/batchRequestManagerHandlers.ts`](../src/handlers/batchRequestManagerHandlers.ts)
- [`src/handlers/tokenInstanceHandlers.ts`](../src/handlers/tokenInstanceHandlers.ts)
- [`src/handlers/balanceSheetHandlers.ts`](../src/handlers/balanceSheetHandlers.ts)

---

## Testing

Run single-chain e2e on multichain config before enabling cross-chain phases — fast regression signal.
