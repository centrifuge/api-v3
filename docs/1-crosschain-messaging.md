# 1 — Cross-chain messaging (Gateway + MultiAdapter)

**Status:** Pass 2 — action path (**REQUEST CHANGES** per migration review; **BLOCK `generatedAlwaysAs`** per Drizzle review)  
**Risk:** Critical  
**Depends on:** [0 — principles](./0-ponder-ordering-migration-overview.md)

---

## Review verdicts

### Migration plan (REQUEST CHANGES)

Upsert-facts direction is sound, but the initial status SQL could not reproduce today's `Unsent` → `AwaitingBatchDelivery` transition or post-retry `Executed` semantics. Corrections below are **mandatory** before Phase A handlers ship.

### Drizzle / Postgres (BLOCK `generatedAlwaysAs`)

**Ponder 0.16.6 rejects `generatedAlwaysAs` at build** (`node_modules/ponder/src/build/schema.ts` L95–98: `generated columns are unsupported`). DDL kit does not emit `GENERATED ALWAYS AS` SQL.

**Approved mechanism:** fact columns + **writable** `status` enum recomputed in `upsertFacts` via `sql.raw(CASE …)` on every `ON CONFLICT DO UPDATE`. See [§ A0 spike gate](#a0-spike-gate).

**Do not ship Phase A handlers without:**

1. **A0b spike pass** — writable enum + upsert CASE + GraphQL `WHERE status = …` (A0a documents expected `generatedAlwaysAs` failure).
2. **Corrected status CASE** — message `repaidAt*` fact + `executed_at` before `failed_at`.
3. **`upsertFacts` only** — never `saveMany` / `Service.save()` on crosschain entities ([`Service.ts`](../src/services/Service.ts) L206–212).
4. **Committed parity fixtures** — see [§ Test fixtures](#test-fixtures).

---

## Goal

Make the message/payload pipeline **order-agnostic across chains**: any handler may run first; final GraphQL `crosschainMessage.status` and `crosschainPayload.status` match today's omnichain semantics after full reindex.

---

## Schema changes (`ponder.schema.ts`)

### `crosschain_message` — fact columns + writable `status`

**Handlers never set `status` in TS** — only `upsertFacts` SET recomputes it from merged facts.

**Add fact columns** (nullable unless noted):

| Column group | Set by | Fields |
|--------------|--------|--------|
| Prepare | `gateway:PrepareMessage` (sender) | `preparedAt`, `preparedAtBlock`, `preparedAtTxHash`, `preparedAtChainId` |
| Batch link | `gateway:UnderpaidBatch` (sender) | `batchedAt*`, `payloadId`, `payloadIndex` |
| Repay / send | `gateway:RepayBatch` (sender) | **`repaidAt*`** (per message row — replaces `awaitingBatchDelivery()` loop) |
| Execute | `gateway:ExecuteMessage` (receiver) | `executedAt*` (+ `executedAtChainId`); **merge clears `failedAt` / `failReason`** |
| Fail | `gateway:FailMessage` (receiver) | `failedAt*`, `failReason` |
| Core identity | any first writer | `id`, `index`, `hash`, `rawData`, `data`, `messageType`, `fromCentrifugeId`, `toCentrifugeId`, `poolId`, `tokenId` |

> **P0 fix (migration review):** Deleting the `RepayBatch` `awaitingBatchDelivery()` loop without a replacement fact leaves batch-only rows (`payload_id` set, `prepared_at` null) stuck as `Unsent`. Promotion is **indexer semantics** (not on-chain) but production GraphQL depends on it. Payload-level `repaid_at` cannot drive message status — status CASE is **same-row only** ([doc 0 §2](./0-ponder-ordering-migration-overview.md)).

> **Timestamper gap:** `timestamperFields` today emits only `At`, `AtBlock`, `AtTxHash` — no `ChainId`. Extend `timestamperFields` (or a parallel `timestamperFieldsWithChain`) for `*AtChainId` columns.

**Schema:** keep writable enum (NOT `.generatedAlwaysAs()`):

```ts
status: CrosschainMessageStatus("crosschain_message_status").notNull(),
```

**Status CASE** (recomputed in `upsertFacts` SET — snake_case in raw SQL):

```sql
CASE
  WHEN crosschain_message.executed_at IS NOT NULL
    OR excluded.executed_at IS NOT NULL
  THEN 'Executed'::crosschain_message_status
  WHEN crosschain_message.failed_at IS NOT NULL
    OR excluded.failed_at IS NOT NULL
  THEN 'Failed'::crosschain_message_status
  WHEN COALESCE(crosschain_message.payload_id, excluded.payload_id) IS NOT NULL
   AND COALESCE(crosschain_message.prepared_at, excluded.prepared_at) IS NULL
   AND COALESCE(crosschain_message.repaid_at, excluded.repaid_at) IS NULL
  THEN 'Unsent'::crosschain_message_status
  WHEN COALESCE(crosschain_message.payload_id, excluded.payload_id) IS NOT NULL
  THEN 'AwaitingBatchDelivery'::crosschain_message_status
  WHEN COALESCE(crosschain_message.prepared_at, excluded.prepared_at) IS NOT NULL
  THEN 'AwaitingBatchDelivery'::crosschain_message_status
  ELSE 'AwaitingBatchDelivery'::crosschain_message_status
END
```

Use table-qualified names for the **existing row** and `excluded.*` for the **incoming** facts so CASE reflects the merged state. Qualify enum cast as `"<schema>"."crosschain_message_status"` if A0b cast fails.

**Retry semantics (P0):** Protocol `Gateway.retry()` emits a second `ExecuteMessage` after `FailMessage`. **`executed_at` must win over `failed_at` in CASE**, and execute merge must **null out** `failed_at` / `fail_reason`.

**PK:** keep `(id, index)`. See [§ Index assignment](#index-assignment-deterministic).

### `crosschain_payload` — fact columns + writable `status`

| Fact group | Set by |
|------------|--------|
| `preparedAt*` | `UnderpaidBatch` (existing) |
| `repaidAt*` | `gateway:RepayBatch` and/or `multiAdapter:SendPayload` (v3_1 skip-underpaid path must set `repaidAt*`, not only `preparedAt*`) |
| `deliveredAt*` | `multiAdapter:HandlePayload` / `HandleProof` |
| `completedAt*` | when all child messages executed (handler writes fact only) |
| `partiallyFailedAt*` | `FailMessage` when any child failed — **only after** `delivered_at` set |

**Schema:** writable enum. **Status CASE** (in `upsertFacts` SET):

```sql
CASE
  WHEN COALESCE(crosschain_payload.completed_at, excluded.completed_at) IS NOT NULL
  THEN 'Completed'::crosschain_payload_status
  WHEN COALESCE(crosschain_payload.partially_failed_at, excluded.partially_failed_at) IS NOT NULL
  THEN 'PartiallyFailed'::crosschain_payload_status
  WHEN COALESCE(crosschain_payload.delivered_at, excluded.delivered_at) IS NOT NULL
  THEN 'Delivered'::crosschain_payload_status
  WHEN COALESCE(crosschain_payload.repaid_at, excluded.repaid_at) IS NOT NULL
  THEN 'InTransit'::crosschain_payload_status
  WHEN COALESCE(crosschain_payload.prepared_at, excluded.prepared_at) IS NOT NULL
  THEN 'Underpaid'::crosschain_payload_status
  ELSE 'Underpaid'::crosschain_payload_status
END
```

Final `ELSE 'Underpaid'` duplicates the `prepared_at` branch — harmless; ordering is sound **if** handlers gate `partially_failed_at` until `delivered_at`.

### `adapter_participation`

Already append-only with composite PK — **no change**. Keep `insertMany` + `onConflictDoNothing`.

### Recommended indexes

```sql
-- Payload completion aggregate (prefer over status filter)
CREATE INDEX IF NOT EXISTS crosschain_message_payload_executed_idx
  ON crosschain_message (payload_id, payload_index)
  WHERE executed_at IS NOT NULL;

-- Keep existing statusIdx on crosschain_message.status / crosschain_payload.status
```

---

## A0 spike gate

### A0a — `generatedAlwaysAs` (expect **FAIL** on Ponder 0.16.6)

Throwaway table in spike branch:

```ts
status: SpikeStatus("spike_status")
  .notNull()
  .generatedAlwaysAs(sql`
    CASE
      WHEN fact_at IS NOT NULL THEN 'B'::spike_status
      ELSE 'A'::spike_status
    END
  `),
```

| Step | Action | Pass | Fail |
|------|--------|------|------|
| 1 | `pnpm codegen` | — | `generated columns are unsupported` → **BLOCK**; use A0b |
| 2 | Future Ponder | DDL has `GENERATED ALWAYS AS (...) STORED` | Missing STORED → Drizzle/Ponder bug |

### A0b — production path (expect **PASS**)

Writable enum; derive in `onConflictDoUpdate.set`:

```ts
await context.db.sql
  .insert(SpikeWritable)
  .values({ id: "0x01", factAt: null })
  .onConflictDoUpdate({
    target: [SpikeWritable.id],
    set: {
      factAt: new Date(),
      status: sql.raw(`
        CASE
          WHEN excluded.fact_at IS NOT NULL THEN 'B'::spike_status
          ELSE 'A'::spike_status
        END
      `),
    },
  })
  .returning();
```

| Step | Action | Pass | Fail |
|------|--------|------|------|
| 1 | `pnpm codegen` | GraphQL `spikeWritable { status }` + `SpikeWritableFilter` | Missing filter → client break |
| 2 | Insert + upsert | `.returning()` has `status: "B"` | PG enum cast error |
| 3 | GraphQL | `spikeWritables(where: { status: "B" })` | Filter ignored |
| 4 | Enum qualification | Cast works in SET | Qualify `"schema"."spike_status"` |

### A0c — `saveMany` regression (mandatory)

Prove blind `excluded."col"` over all columns breaks derived fields:

```206:212:src/services/Service.ts
    for (const [key, col] of Object.entries(columns)) {
      if (pkSet.has(key)) continue;
      if (Object.prototype.hasOwnProperty.call(createdNulls, key)) continue;
      const pgName = (col as { name: string }).name;
      const quoted = `"${pgName.replace(/"/g, '""')}"`;
      conflictSet[key] = sql.raw(`excluded.${quoted}`);
    }
```

**Pass:** dedicated `upsertFacts` with per-column merge + `status` from CASE. **Fail:** `saveMany` on crosschain entities without excluding derived columns.

**Derived column set** (skip in any generic merge loop):

```ts
const DERIVED_KEYS = new Set(["status"]);
```

---

## Service layer

### New: `CrosschainMessageService.upsertFacts`

Implement with documented **merge matrix** — not `saveMany`:

| Column | Merge rule |
|--------|------------|
| `*At` timestamps | `LEAST` of non-null on PG ≥14; explicit `CASE` fallback on older PG |
| `payloadId`, `payloadIndex` | `COALESCE(existing, excluded)` |
| `rawData`, `data` | sender-chain writer wins when both non-null |
| `executedAt*` on execute | set; **clear** `failedAt`, `failReason` |
| `failedAt*` on fail | set only if `executedAt` null |
| `repaidAt*` | set on `RepayBatch`; never cleared |
| **`status`** | full CASE from merged row + `excluded` (see schema section) |

```ts
const DERIVED_KEYS = new Set(["status"]);

function mergeEarliest(pgName: string) {
  return sql.raw(`
    CASE
      WHEN crosschain_message."${pgName}" IS NULL THEN excluded."${pgName}"
      WHEN excluded."${pgName}" IS NULL THEN crosschain_message."${pgName}"
      ELSE LEAST(crosschain_message."${pgName}", excluded."${pgName}")
    END
  `);
}

static async upsertFacts(context, event, key: { id, index }, facts: Partial<...>) {
  await context.db.sql
    .insert(CrosschainMessage)
    .values({ ...key, ...facts, ...insertDefaults(...) })
    .onConflictDoUpdate({
      target: [CrosschainMessage.id, CrosschainMessage.index],
      set: {
        preparedAt: mergeEarliest("prepared_at"),
        payloadId: sql.raw(`COALESCE(crosschain_message.payload_id, excluded.payload_id)`),
        executedAt: sql.raw(`COALESCE(crosschain_message.executed_at, excluded.executed_at)`),
        failedAt: sql.raw(`
          CASE WHEN excluded.executed_at IS NOT NULL THEN NULL
               ELSE COALESCE(excluded.failed_at, crosschain_message.failed_at) END
        `),
        failReason: sql.raw(`
          CASE WHEN excluded.executed_at IS NOT NULL THEN NULL
               ELSE COALESCE(excluded.fail_reason, crosschain_message.fail_reason) END
        `),
        status: messageStatusCase, // full CASE — table + excluded refs
      },
    })
    .returning();
}
```

Remove: `setStatus`, `executed()`, `awaitingBatchDelivery()`, `getFromAwaitingBatchDeliveryOrFailedQueue` (replace with `get` + fact checks for branching only, not gating).

### New: `CrosschainPayloadService.upsertFacts`

Same pattern + payload `status` CASE. Remove `delivered()`, `completed()`, `InTransit()`, `setStatus`.

### `checkPayloadFullyExecuted`

Today counts `status: "Executed"`:

```155:159:src/services/CrosschainMessageService.ts
    return await CrosschainMessageService.count(context, {
      payloadId,
      payloadIndex,
      status: "Executed",
    });
```

**After migration — mandatory:** count where `executed_at IS NOT NULL` (immune to status derivation bugs). Handler still upserts payload `completedAt*` when aggregate true (idempotent).

---

## Handler action path

### `gateway:PrepareMessage`

| Today | Pass 2 |
|-------|--------|
| `insert` + skip duplicate | `upsertFacts` with `preparedAt*`; merge `rawData`, `data`, `poolId`, `tokenId` |
| Hard dependency on empty queue | **Remove** skip logic except idempotent same-tx replay |
| `PoolAdapterService.setCrosschainInProgressFromMessage` | Move to [7-pool-adapters-wiring.md](./7-pool-adapters-wiring.md) — upsert `pool_adapter.hubSignal*` facts |

**Protocol note:** `PrepareMessage` always before `UnderpaidBatch` on same `send()` — confirmed `cfg-protocol-v3` `Gateway.sol` (same-chain only; not a cross-chain guarantee under multichain).

### `gateway:UnderpaidBatch`

| Today | Pass 2 |
|-------|--------|
| `count()` for `payloadIndex` | `MAX(index)+1` per `payloadId` in upsert SQL when creating new row |
| `insert` messages `Unsent` | `upsertFacts` per message with `payloadId`, `payloadIndex`, `batchedAt*` |
| Link awaiting rows | `upsertFacts` merge `payloadId` onto existing `(id, index)` |

Never `return` on decode failure for one message — log + skip that row only.

### `gateway:RepayBatch`

| Today | Pass 2 |
|-------|--------|
| Hard fail if no Underpaid payload | `upsertFacts` payload `repaidAt*`; stub payload if missing |
| Loop `awaitingBatchDelivery()` on `Unsent` rows | **`upsertFacts` `repaidAt*` on every message** in `(payloadId, payloadIndex)` |

```284:294:src/handlers/gatewayHandlers.ts
  // TODAY: promotes Unsent → AwaitingBatchDelivery via mutable status
  for (const crosschainMessage of crosschainMessages) {
    crosschainMessage.awaitingBatchDelivery();
  }
  // PASS 2: batch upsert repaidAt* on same message set
```

### `gateway:ExecuteMessage` ⚠️ critical

| Today | Pass 2 |
|-------|--------|
| Hard fail if message missing | **`upsertFacts`** with `executedAt*`; decode args to fill identity if first writer |
| | Clear `failedAt` / `failReason` on merge |
| Payload completion | If `payloadId` known → `checkPayloadFullyExecuted` (`executed_at`) → upsert payload `completedAt*` |

### `gateway:FailMessage`

| Today | Pass 2 |
|-------|--------|
| Hard fail if missing | `upsertFacts` with `failedAt*`, `failReason` only if `executedAt` null |
| Pool adapter clear | Per [7](./7-pool-adapters-wiring.md) |

### `multiAdapter:SendPayload`

| Today | Pass 2 |
|-------|--------|
| Create/link payload | `upsertFacts`; v3_1 path must set **`repaidAt*`** when skipping underpaid |
| `linkMessagesToPayload` | Batch `upsertFacts` |

### `multiAdapter:HandlePayload` / `HandleProof`

| Today | Pass 2 |
|-------|--------|
| Hard fail if payload missing | `upsertFacts` stub — **`index` from event linkage**, not blind `0` (v3_1 multi-row `payloadId`) |
| `delivered()` / `completed()` | `deliveredAt*` / `completedAt*` facts only |

### `multiAdapter:SendProof` (v3)

Upsert participation + facts; no hard fail on missing payload (stub with correct `index`).

---

## Index assignment (deterministic)

**Open (P1):** duplicate `messageHash` in one batch / parallel failures (`Gateway.sol` L55, L131–132). Production sample still required.

| Scenario | Rule |
|----------|------|
| `UnderpaidBatch` | `index` = position of message in batch array |
| `PrepareMessage` only | `index` = send ordinal on sender |
| `ExecuteMessage` first | **Do not** always use `0` — reconcile when `UnderpaidBatch` arrives |
| `HandlePayload` stub | Match `payloadIndex` from linked messages |

---

## GraphQL parity matrix

| Entity/field | Omnichain today | Plan (corrected) | Test query |
|---|---|---|---|
| `crosschainMessage.status` (underpaid → repay) | `Unsent` → `AwaitingBatchDelivery` on `RepayBatch` | `Unsent` only if `payload_id` ∧ ¬`prepared_at` ∧ ¬`repaid_at`; else `AwaitingBatchDelivery` | `crosschainMessages(where: { id })` |
| `crosschainMessage.status` (retry) | `Failed` → `Executed` | `executed_at` before `failed_at` in CASE + clear fail facts on execute | failed-then-retry fixture |
| `crosschainPayload.status` (repay) | `Underpaid` → `InTransit` | `repaid_at` set | `crosschainPayloads(where: { id })` |
| `crosschainPayload.status` (completion) | All msgs executed → `Completed` | `executed_at` aggregate → `completedAt*` | nested messages |
| Filter `status: Completed` | Mutable enum index | Writable enum + upsert CASE — **verify in A0b** | `crosschainPayloads` filter |

**Breaking change risk:** **Low** with upsert-computed mutable enums (same field names/types). **High** if switching to `onchainView` (JSON status).

---

## Status derivation audit

### `crosschain_message`

| Scenario | Facts | Result | Matches today? |
|----------|-------|--------|----------------|
| Underpaid → repay | `payload_id` ∧ ¬`prepared_at` ∧ ¬`repaid_at` | `Unsent` | Yes (until `RepayBatch`) |
| After `repaid_at` | `payload_id` set | `AwaitingBatchDelivery` | Yes (replaces `awaitingBatchDelivery()` loop) |
| Prepare only | `prepared_at` set | `AwaitingBatchDelivery` | Yes |
| Fail | `failed_at` set, ¬`executed_at` | `Failed` | Yes |
| Retry execute | `executed_at` set (+ merge clears `failed_at`) | `Executed` | Yes |

### `crosschain_payload`

| Edge case | Rule |
|---|---|
| `partially_failed_at` before delivery | Handler must not set until `delivered_at` present |
| `SendPayload` skip-underpaid | Must set `repaid_at`, not only `prepared_at` |

---

## Protocol vs indexer alignment

| Claim | Protocol (`cfg-protocol-v3`) | Indexer today | Mismatch? |
|---|---|---|---|
| Prepare before Underpaid (same send) | `Gateway.sol` L163, L205–226 | `gatewayHandlers.ts` comment | **No** (same-chain) |
| RepayBatch then adapter send | `Gateway.sol` L230–242 | `RepayBatch` handler | **No** on-chain; promotion is indexer-only |
| Duplicate `messageHash` tracking | `Gateway.sol` L55, L131–132 | `(id, index)` PK | **Partial** |
| Retry after fail | `Gateway.retry()` + tests | Mutable status overwrite | Plan via CASE + merge |
| v3 proof quorum | `MultiAdapter.sol` L118–134 | `checkPayloadVerified` | **No** |

---

## Pass-1 risk → pass-2 mitigation

| Pass-1 risk | Mitigation | Rating |
|---|---|---|
| `ExecuteMessage` hard-fail | `upsertFacts` | **WEAK** until index rules fixed |
| `RepayBatch` / `HandlePayload` hard-fail | stub upsert | **SOUND** (payload index rules still weak) |
| `count()` index | batch position / MAX+1 | **WEAK** — production validation open |
| Mutable `status` | upsert CASE → writable enum | **FIXED** |
| `RepayBatch` Unsent promotion | message `repaidAt*` | **FIXED** |
| `saveMany` overwrites derived cols | `upsertFacts` only | **FIXED** (Drizzle review) |
| Cross-chain permuted order | fact upserts + fixtures | **WEAK** until A4 tests |

---

## Phase A sub-phases (revised)

| Sub-phase | Deliverable | Gate |
|-----------|-------------|------|
| **A0a** | `generatedAlwaysAs` spike (expect fail on 0.16.6) | Documents platform block |
| **A0b** | Writable enum + upsert CASE + GraphQL filter | **Must pass before A1** |
| **A0c** | `saveMany` must not touch `status` | Regression test |
| **A1** | Schema: fact columns + writable enums | Reviewer sign-off on CASE SQL |
| **A2** | Services: `upsertFacts` + merge matrix | Unit tests per column rule |
| **A3** | Handlers: gateway + multiAdapter upsert-only | No hard fails |
| **A4** | Tests: table-driven SQL + permuted replay | Parity diff vs omnichain |
| **F** | `ordering: "multichain"` only after A4 | Production cutover |

---

## Test fixtures

Define and commit before A3:

1. **Underpaid → repay promotion** — `payload_id`, no `prepared_at`; assert `AwaitingBatchDelivery` after `RepayBatch`.
2. **Fail → retry → execute** — same `(id, index)`; assert final `Executed`.
3. **Duplicate messageHash in batch** — align index rules with production sample.
4. **v3_1 multi `payloadIndex`** — HandlePayload stub picks correct index.
5. **Permuted order vectors** — execute-before-prepare, handle-before-send, etc.
6. **v3 proof quorum** — regression only.

Store as: `tests/fixtures/crosschain-messaging/` + GraphQL snapshot ids at block `B`.

---

## Files to change

| File | Change |
|------|--------|
| [`ponder.schema.ts`](../ponder.schema.ts) | Fact columns + writable enums; extend `timestamperFields` for `*ChainId` |
| [`src/handlers/gatewayHandlers.ts`](../src/handlers/gatewayHandlers.ts) | Upsert-only; `RepayBatch` message `repaidAt*` |
| [`src/handlers/multiAdapterHandlers.ts`](../src/handlers/multiAdapterHandlers.ts) | Upsert-only; correct payload `index` |
| [`src/services/CrosschainMessageService.ts`](../src/services/CrosschainMessageService.ts) | `upsertFacts`, merge matrix, `executed_at` aggregate |
| [`src/services/CrosschainPayloadService.ts`](../src/services/CrosschainPayloadService.ts) | `upsertFacts` |
| [`ponder.config.ts`](../ponder.config.ts) | `ordering: "multichain"` in phase F only |

---

## Testing

1. **Table-driven:** status CASE for all fact combinations in audit table.
2. **A0b:** GraphQL `where: { status }` on spike table.
3. **A0c:** prove `saveMany` breaks derived `status`.
4. **Integration:** permuted handler order replay → identical GraphQL to omnichain baseline.
5. **Staging:** full reindex; diff vs omnichain export at block `B`.
