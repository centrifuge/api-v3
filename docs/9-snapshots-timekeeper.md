# 9 — Period snapshots & Timekeeper

**Status:** Pass 2 — action path  
**Risk:** Low  

---

## Goal

Confirm no changes required for multichain; minor hardening only.

---

## Assessment

| Component | Multichain impact |
|-----------|-------------------|
| `Timekeeper` per `chainId` | None |
| `blockHandlers` `centrifugeId` scope | None |
| `snapshotter` `onConflictDoNothing` | Idempotent |
| Event-driven snapshots | Inherit parent domain fixes (e.g. holding escrow must exist — [doc 3](./3-asset-escrow-bootstrap.md)) |

---

## Pass 2 action path

### 1. No generated columns

Snapshot tables are append-only history — facts only; no derived status.

### 2. Verify after full reindex

```graphql
query { poolSnapshots(limit: 10, orderBy: { blockNumber: DESC }) { id blockNumber timestamp } }
```

Compare row counts per `(id, blockNumber, trigger)` vs omnichain export — expect **exact match**.

### 3. `lastPeriodStart` on `blockchain`

`Timekeeper` upserts via `BlockchainService.save` — already per-chain. No change.

### 4. Token yield augmentation on snapshot

`TokenService.computeYieldsBatch` — read-only at snapshot time; unaffected by ordering mode.

---

## Optional hardening

- Add `chainId` to snapshot trigger string for ops clarity (`${chainName}:NewPeriod` already chain-specific in handler registration).

---

## Files

No mandatory code changes. Validation only:

- [`src/handlers/blockHandlers.ts`](../src/handlers/blockHandlers.ts)
- [`src/helpers/timekeeper.ts`](../src/helpers/timekeeper.ts)
- [`src/helpers/snapshotter.ts`](../src/helpers/snapshotter.ts)

---

## Gate for production

Snapshot diff script passes at block `B` before cutover (part of [doc 0](./0-ponder-ordering-migration-overview.md) runbook).
