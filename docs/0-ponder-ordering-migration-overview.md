# 0 — Ponder ordering migration: overview

**Status:** Pass 2 — action paths (**Phase A: REQUEST CHANGES** — [migration review](#plan-review-summary-migration) + [Drizzle review](#drizzle--postgres-review-summary))  
**Config today:** `ordering: "omnichain"` in [`ponder.config.ts`](../ponder.config.ts)  
**Target:** `ordering: "multichain"` + schema v2 (full reindex)

---

## Pass 2 engineering principles

These apply to **every** domain doc:

### 1. Upsert facts, never fail on missing cross-chain rows

Handlers **only** `upsert` / `insertMany` + `onConflictDoUpdate` **fact columns** (timestamps, amounts, addresses, decoded payloads). Remove `serviceError` + early `return` when a prerequisite row from another chain is absent.

Merge policy on conflict (document per-column — see [doc 1 merge matrix](./1-crosschain-messaging.md#service-layer)):

- **Timestamps:** earliest non-null per leg (`LEAST` on PG ≥14, or explicit `CASE` fallback).
- **Payload linkage:** `COALESCE(existing, excluded)`.
- **Decoded fields:** sender chain wins for `rawData` / `data` when both non-null.
- **Execute after fail:** set `executedAt*` and **explicitly null** `failedAt` / `failReason` (protocol `Gateway.retry()`).
- **Ponder PG proxy:** `sql.raw(\`excluded."column"\`)` in `onConflictDoUpdate` — see `Service.ts` L178–212.

### 2. Derived status → upsert-computed mutable enums (not `generatedAlwaysAs`)

**Ponder 0.16.6 blocks `generatedAlwaysAs`** at schema validation (`node_modules/ponder/src/build/schema.ts` — `generated columns are unsupported`). DDL kit does not emit generated SQL.

Side-effect fields (`status`, `crosschainInProgress`, basin `state`) remain **writable enum columns** on `onchainTable`. Handlers do **not** set them directly in application code; `upsertFacts` recomputes them in `ON CONFLICT DO UPDATE SET` via `sql.raw(CASE …)` from merged same-row facts.

| Need | Approach |
|------|----------|
| Messaging `status` | Fact columns + CASE in `upsertFacts` SET |
| `crosschainInProgress` | `hubSignal*` / `spokeAck*` facts + CASE in hub/spoke upsert SET |
| Basin `state` | Fact timestamps + CASE in upsert SET (or query facts directly in reconciliation) |

**Do not use `onchainView`** for filterable enums — aliased SQL maps to `GraphQLJSON` in Ponder 0.16.6, breaking `where: { status: … }`.

**Naming:** raw SQL uses **snake_case** DB names (`executed_at`, `repaid_at`); TS uses camelCase. Build dynamic SQL from `col.name` in Drizzle metadata.

**Future:** if a Ponder release supports `generatedAlwaysAs` end-to-end (validation + DDL + GraphQL), revisit — run [doc 1 § A0a](./1-crosschain-messaging.md#a0-spike-gate) first.

### 3. Full reindex on new schema

- No in-place migration of live DB rows.
- Ship `ponder.schema.ts` v2 + handler changes + `ordering: "multichain"` together.
- Run `pnpm update-registry` → `pnpm codegen` → deploy → **wipe schema** → full historical reindex.
- Parity gate: diff omnichain snapshot (pre-migration) vs multichain reindex at block `B`.

### 4. Deterministic keys (no `count()` for identity)

- Message `index` = batch position when known (not blind `0` on execute-first).
- Payload `index` = `MAX(index)+1` per `payloadId` when creating new batch row on sender chain.

### 5. Never `saveMany` for crosschain entities with derived columns

`Service.saveMany` sets every non-PK column via `excluded.*` (`Service.ts` L206–212). That **breaks** derived `status` / `crosschainInProgress` / `state` and contradicts the merge matrix. Use dedicated `upsertFacts` only. `insertMany` + `onConflictDoNothing` remains correct for append-only tables (e.g. `adapter_participation`).

---

## Why this migration matters

| Mode | Guarantee |
|------|-----------|
| **Omnichain** | Global handler queue across chains. |
| **Multichain** | Independent per-chain `(block, txIndex, logIndex)` queues. |

**PostgreSQL:** recommend **PG 14+** for `LEAST`/`GREATEST` NULL semantics in merge helpers.

---

## Domain documents

| # | Domain | Risk | Pass 2 |
|---|--------|------|--------|
| [1](./1-crosschain-messaging.md) | Gateway + MultiAdapter | **Critical** | ⚠️ Migration + Drizzle revised |
| [2](./2-hub-spoke-crosschain-state.md) | `crosschainInProgress` | **High** | ⚠️ Drizzle revised |
| [3](./3-asset-escrow-bootstrap.md) | Asset + escrow | **High** | ✅ Fact-upsert (unchanged mechanism) |
| [4](./4-vault-crosschain-lifecycle.md) | Vault lifecycle | **High** | ✅ Fact-upsert |
| [5](./5-basin-crosschain-reconciliation.md) | Grove Basin | **High** | ⚠️ Drizzle revised |
| [6](./6-investor-share-transfers.md) | Share transfers | **Medium** | ✅ |
| [7](./7-pool-adapters-wiring.md) | Pool adapters | **Medium** | ✅ |
| [8](./8-within-chain-ordering.md) | Same-chain | **Medium** | ✅ |
| [9](./9-snapshots-timekeeper.md) | Snapshots | **Low** | ✅ |

---

## Plan review summary (migration)

**Verdict: REQUEST CHANGES** on Phase A before implementation.

| Priority | Issue | Resolution |
|----------|--------|------------|
| **P0** | `Unsent` stuck after `RepayBatch` | Per-message `repaidAt*` + status CASE |
| **P0** | Retry shows `Failed` not `Executed` | `executed_at` before `failed_at` in CASE; clear fail facts on execute |
| **P1** | Execute-first `index=0` vs duplicate `messageHash` | Index rules + production sample |
| **P1** | HandlePayload stub `index: 0` | Derive from linkage |
| **P1** | Parity fixtures undefined | doc 1 § Test fixtures |

---

## Drizzle / Postgres review summary

**Verdict: BLOCK `generatedAlwaysAs`** on Ponder 0.16.6. **APPROVE WITH CONDITIONS** on fact-upsert + upsert-computed mutable enums.

| Priority | Issue | Resolution |
|----------|--------|------------|
| **P0** | Ponder rejects `generatedAlwaysAs` at build | Upsert-time SQL CASE → mutable enum ([doc 1 § A0](./1-crosschain-messaging.md#a0-spike-gate)) |
| **P0** | `saveMany` / `Service.save()` full-row SET | `upsertFacts` only; exclude derived cols |
| **P1** | `checkPayloadFullyExecuted` uses `status` filter | `executed_at IS NOT NULL` |
| **P1** | Enum cast may need schema qualification | Test in A0b |
| **P2** | `*AtChainId` not in `timestamperFields` | Extend helper (doc 1) |
| **P2** | `onchainView` for status | Rejected — JSON type |

Phases **B–F blocked** until **A4** parity diff passes.

---

## Implementation phases

| Phase | Scope | Exit criteria |
|-------|--------|---------------|
| **A0–A4** | [1-crosschain-messaging](./1-crosschain-messaging.md) | GraphQL parity on fixtures + permuted replay |
| ↳ **A0a** | `generatedAlwaysAs` spike (expect **FAIL** on 0.16.6) | Documents platform gate |
| ↳ **A0b** | Writable enum + upsert CASE + GraphQL `WHERE status` | **Real gate** before A1 |
| ↳ **A0c** | `saveMany` must not touch derived cols | Regression test |
| ↳ **A1** | Schema facts + writable enums | Reviewer sign-off on CASE SQL |
| ↳ **A2** | `upsertFacts` + merge helpers | Unit tests |
| ↳ **A3** | Gateway + MultiAdapter handlers | No cross-chain hard fails |
| ↳ **A4** | Fixtures + parity diff | Match omnichain at block `B` |
| **B–F** | Docs 2–9 + multichain flip | Blocked on A4 |

**Do not ship A3 without A0b pass and corrected status CASE SQL.**

---

## Rollout runbook (all phases)

1. Merge schema + handler PRs to `main`.
2. `pnpm update-registry && pnpm codegen`.
3. Staging: new `DATABASE_SCHEMA`, `ordering: "multichain"`, index from deployment blocks.
4. Export GraphQL snapshots at block `B` from production omnichain (reference).
5. Reindex staging to `B`; parity diff.
6. Production: maintenance window, full reindex, smoke queries.
7. Rollback = previous image + previous schema name.

---

## Observability

- Rows with `executed_at` set but wrong `status` → should be 0 if CASE runs on every upsert.
- Prefer monitoring fact consistency over enum drift.
- Alert on `basin_reconciliation_warning` rate post-cutover.
