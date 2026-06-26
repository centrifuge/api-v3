# cfg-api-v3 — AI & contributor guide

Centrifuge protocol indexer: [Ponder](https://ponder.sh/) ingests EVM logs/blocks → [`src/handlers/`](src/handlers/) → [`src/services/`](src/services/) → PostgreSQL (Drizzle); GraphQL while running. Setup/ops: [README.md](README.md). Extra Cursor rules: [`.cursor/rules/*.mdc`](.cursor/rules/) (always-on summary: `cfg-api-v3-core.mdc`).

## Hard rules

1. **Handlers** — Only under `src/handlers/`. Subscribe with `multiMapper(...)` or `ponder.on(...)`. Thin: decode `event.args`, orchestrate; no heavy domain logic here.
2. **No DB in handlers** — No `context.db.*`, Drizzle builders, or raw SQL. Use services. **Exception:** call [`snapshotter`](src/helpers/snapshotter.ts) for snapshot inserts (do not duplicate that pattern).
3. **No ad-hoc Ponder handler DB** — Persistence lives in entity services on [`Service.ts`](src/services/Service.ts); do not inline `context.db` in handlers.
4. **Batching** — Prefer `insertMany` / `saveMany`; query once, update in memory, batch-save when it fits.
5. **`generated/`** — Never edit. Regenerate via `pnpm update-registry`, `pnpm codegen`, or build/start tooling; fix registry/upstream instead.

## Services

- **Shape:** one service per main schema entity (or tight group). `export class EntityService extends Service<typeof Table> { static readonly entityTable = Table; static readonly entityName = "EntityName"; }` — see [`AdapterService.ts`](src/services/AdapterService.ts). Statics (on `Service`): `insert`, `insertMany`, `saveMany`, `get`, `getOrInit`, `upsert`, `query`, `count`; instance `save` / `delete`. Add methods for shared business rules.
- **Logging** — `serviceLog` / `serviceError` from [`logger.ts`](src/helpers/logger.ts); `expandInlineObject` for record-shaped logs. Every **meaningful** public/static method (DB, side effects, non-trivial branches) logs at least once; trivial pure accessors (e.g. shallow `read()`) need not. `serviceLog` is a no-op under `ponder start`; `serviceError` still logs — see `logger.ts`.
- **Handlers never call** `context.db.sql` / `context.db.find`; they call `FooService.get(...)` etc. Base layer uses Drizzle internally.
- **Batch upserts** — Extending `saveMany`: follow `Service.ts` comment; use `sql.raw(\`excluded."column"\`)`for Ponder’s PG proxy, not broken`excluded` expansions.

**Batch choice:** `insertMany` — many rows, conflict-do-nothing style. `saveMany` — same upsert semantics as instance `save`. Examples: [`gatewayHandlers.ts`](src/handlers/gatewayHandlers.ts), [`CrosschainMessageService.ts`](src/services/CrosschainMessageService.ts).

## `multiMapper` (multi-version contracts)

Versioned keys in [`ponder.config.ts`](ponder.config.ts) (`HubV3`, `HubV3_1`, …). Register once with unversioned name, e.g. `multiMapper("Hub:NotifyPool", handler)` → all ABI-compatible versions. `:setup` is lifecycle, not an ABI event. Overloaded events: follow string rules in [`multiMapper.ts`](src/helpers/multiMapper.ts).

## Chains & contracts

[`chains.ts`](src/chains.ts) — RPC, `blocks`, deduped chains. [`contracts.ts`](src/contracts.ts) — `decorateDeploymentContracts`. [`ponder.config.ts`](ponder.config.ts) — merged `contractsV3` / `contractsV3_1`, `ordering: "multichain"`. Optional migration blocks: [`config.ts`](src/config.ts) (`V3_1_MIGRATION_BLOCKS`).

## Ponder factory discovery cache bug (pinned: `ponder@0.16.6`)

**Upstream:** [ponder-sh/ponder#2271](https://github.com/ponder-sh/ponder/issues/2271) (reported on **0.16.3**; **still present in 0.16.6**, our current pin — see `package.json`). Treat as an open Ponder bug until we upgrade past a release that removes the fallback below.

### What it is

Ponder **factory** contracts discover child addresses from parent deploy events, then subscribe child contracts for handler events. Progress is cached in the `ponder_sync` schema:

| Cache key | Table / fragment prefix | Meaning |
| --------- | ------------------------- | ------- |
| Child event sync | `log_*` in `ponder_sync.intervals` | `eth_getLogs` on discovered child addresses |
| Factory discovery | `factory_log_*` in `ponder_sync.intervals` | Scan parent factory for deploy events |
| Discovered children | `ponder_sync.factory_addresses` | Child address → deploy block |

On startup, `syncStore.getIntervals()` loads both interval types. A **v0.14→v0.15 migration fallback** in Ponder core then does this in memory when `filterIntervals` exist, `factoryIntervals` are empty, and filter/factory share the same `fromBlock`/`toBlock`:

```ts
// packages/core/src/sync-store/index.ts (0.16.6) — do not replicate in app code
if (filterIntervals.length > 0 && factoryIntervals.length === 0 && …) {
  factoryInterval.intervals = filterIntervals; // treats discovery as complete
}
```

`log_*` progress is **not** equivalent to `factory_log_*` progress, but the fallback conflates them. Interval planning (`getRequiredIntervals` / `getRequiredIntervalsWithFilters` in Ponder runtime) then computes **no missing factory intervals**, so `syncAddressFactory` never runs, child rows in `factory_addresses` stay missing/stale, and **child-address-based handlers silently skip events**.

### Why `log_*` and `factory_log_*` diverge

- `log_*` fragment IDs omit block range (`log_{chainId}_{addressKey}_{topics…}`).
- `factory_log_*` fragment IDs **include** `fromBlock`/`toBlock` (`factory_log_{chainId}_{parent}_{selector}_{location}_{from}_{to}`).

So after a **start/end block change**, redeploy, or cache import, you can have stale `log_*` rows while the **current** `factory_log_*` row is empty — exactly when the fallback fires.

### Factory children in this indexer

All factory mappings live in [`ponder.config.ts`](ponder.config.ts) via `decorateDeploymentContracts` ([`src/contracts.ts`](src/contracts.ts) `factory({…})`):

| Mapping | Parent (factory) | Deploy event | Child handlers |
| ------- | ---------------- | ------------ | -------------- |
| `vaultV3` / `vaultV3_1` | Spoke / VaultRegistry | `DeployVault` | Async/sync vault handlers |
| `poolEscrowV3` / `poolEscrowV3_1` | PoolEscrowFactory | `DeployPoolEscrow` | PoolEscrow / balance-sheet paths |
| `onOfframpManagerV3` / `…_3_1` | OnOfframpManagerFactory | `DeployOnOfframpManager` | On/off-ramp managers |
| `merkleProofManagerV3` / `…_3_1` | MerkleProofManagerFactory | `DeployMerkleProofManager` | Merkle proof managers |
| `tokenInstanceV3` / `…_3_1` | Spoke | `AddShareClass` | Share token / `TokenInstance` |
| `refundEscrowV3_1` | RefundEscrowFactory | `DeployRefundEscrow` | Refund escrows |

Missing entities for **factory-deployed** contracts with **no handler bug** and **on-chain deploy events present** should be checked against this issue before chasing application logic.

### Triggers relevant here

1. **`pnpm sync`** — restores a published `ponder_sync` snapshot ([README.md](README.md)); high risk if snapshot predates config/registry changes or was built with different factory identity.
2. **Registry / `ponder.config` changes** — new `startBlock`/`endBlock`, `V3_1_MIGRATION_BLOCKS`, v3→v3_1 factory parent switch (e.g. vault factory Spoke → VaultRegistry).
3. **Reuse of `ponder_sync` across environments** — `sync:export` / `sync:push` without clearing factory discovery state for the current factory row.
4. **Resume after partial sync** — `log_*` intervals written but `factory_log_*` or `factory_addresses` incomplete for the active factory identity.

### Symptoms (attribute to #2271 when they match)

- GraphQL/API missing **Vault**, **PoolEscrow**, **TokenInstance**, **OnOffRampManager**, **MerkleProofManager**, or **RefundEscrow** rows while parent factory events exist on-chain.
- Handlers for child contracts never ran (no corresponding entity / investor / escrow side-effects).
- `ponder_sync.factory_addresses` sparse or empty for the factory row, while `ponder_sync.intervals` has matching `log_*` progress.
- Bug appears after sync cache import or block-range migration, not after a handler/schema change alone.
- **Not** this bug: missing data on **static** contracts (Hub, Spoke gateway, etc.) or entities created only via non-factory parent events.

### How to evaluate

1. Confirm the entity is factory-deployed (table above).
2. Find the deploy event on-chain (e.g. `DeployVault`, `DeployPoolEscrow`, `AddShareClass`).
3. Inspect DB (replace chain/factory as needed):

```sql
-- Child addresses discovered for a factory identity
SELECT fa.address, fa.block_number
FROM ponder_sync.factory_addresses fa
JOIN ponder_sync.factories f ON f.id = fa.factory_id
WHERE fa.chain_id = <chainId>
ORDER BY fa.block_number;

-- Interval fragments: log_* vs factory_log_* completeness
SELECT fragment_id, blocks
FROM ponder_sync.intervals
WHERE fragment_id LIKE 'log_%' OR fragment_id LIKE 'factory_log_%'
ORDER BY fragment_id;
```

4. If deploy events exist, child rows are absent, and `factory_log_*` is empty while `log_*` is populated → **likely #2271**, not handler logic.

### Workarounds (ops)

Per upstream issue: delete affected `ponder_sync` rows, then restart/resync so factory discovery runs:

- Rows in `ponder_sync.factory_addresses` for the affected factory/chain.
- Matching `factory_log_*` **and** related `log_*` fragments in `ponder_sync.intervals`.

**All factories (keep RPC cache):** `pnpm sync:invalidate-factories --dry-run` then `pnpm sync:invalidate-factories --yes` — [`scripts/sync-invalidate-factories.mjs`](scripts/sync-invalidate-factories.mjs). Optional `--chain-id <id>`.

Safer for a full fix: **full reindex** with a clean `ponder_sync` (or `ponder dev` / `ponder start` after clearing sync schema) when factory mappings or block ranges change materially. After `pnpm sync`, validate factory children (smoke specs under `test/smoke/specs/` for vault/token-instance are useful).

**Do not** paper over missing children in handlers — fix sync state or wait for an upstream Ponder release that removes the fallback.

## Decimals and investor price math

[`decimalsResolver.ts`](src/helpers/decimalsResolver.ts) — **init only** (`resolveDecimalsForInit`, `resolveAssetDecimals`). Runtime handlers read persisted `.decimals` from entity rows; do **not** call the resolver at runtime and do **not** add nullable decimal helpers that `serviceWarn` and skip work.

**Per-chain init (never initialize entities on a foreign chain):**

| Chain | Event | Persists |
| ----- | ----- | -------- |
| Hub | `hubRegistry:NewAsset` | `AssetRegistration.decimals` (+ ISO `Asset` row) |
| Hub | `shareClassManager:AddShareClass` | `Token.decimals` |
| Spoke | `spoke:RegisterAsset` | `Asset.decimals` (+ address/metadata) |
| Spoke | `spoke:AddShareClass` | `Token` + `TokenInstance.decimals` |

**Runtime reads (mandatory rows — `serviceError` if missing, never warn-and-skip):**

| Handler domain | Share decimals | Asset decimals |
| -------------- | -------------- | -------------- |
| Hub batch epoch (`batchRequestManagerHandlers`) | `Token.read().decimals` | `AssetRegistration.read().decimals` (hub `centrifugeId`) |
| Spoke vault investor math (`vaultHandlers`) | `TokenInstance.read().decimals` | `Asset.read().decimals` |

**v3 / v3_1:** same handler functions via `multiMapper`. Pre-migration batch epoch events come from `shareClassManagerV3` (`scId`, `epoch`, `depositAssetId`, `nav*`); post-migration from `batchRequestManagerV3_1` (`shareClassId`, `epochId`, `assetId`, `price*`). Handlers normalize both; register v3 batch via `multiMapper("shareClassManager:…")` in [`shareClassManagerHandlers.ts`](src/handlers/shareClassManagerHandlers.ts) and v3_1 via `multiMapper("batchRequestManager:…")`.

**Hub epoch aggregates:** `EpochInvestOrder` / `EpochRedeemOrder` — `upsert` on approve, `getOrInit` on issue/revoke; do not gate approve on `Asset` (percentage math uses raw uint amounts). Do not hard-fail issue/revoke when the epoch row is missing if the event supplies the index — use `getOrInit`.

**Forbidden patterns** (enforced by [`test/unit/parity/batch-request-manager-ordering.test.ts`](test/unit/parity/batch-request-manager-ordering.test.ts) and related parity tests): `readEpochInvestorDecimals`, `requireVaultInvestorDecimals`, `if (investorDecimals)`, `if (!decimals) return`, `decimals missing` warn strings.

**Schema / reindex:** `AssetRegistration.decimals` is `notNull` in [`ponder.schema.ts`](ponder.schema.ts). Ship with `hubRegistry:NewAsset` handler upsert; **full reindex** required to backfill historical registrations.

## Snapshots

[`snapshotter.ts`](src/helpers/snapshotter.ts) — copy live entity rows into snapshot tables with block/time/trigger/tx/chain (`onConflictDoNothing`). **Period:** [`timekeeper.ts`](src/helpers/timekeeper.ts) + [`blockHandlers.ts`](src/handlers/blockHandlers.ts) (`${chainName}:NewPeriod`). **Event-driven:** handlers call `snapshotter(context, event, "<ContractVersion>:EventName", entities, SnapshotTable)` after updates — ripgrep `snapshotter(` under `src/handlers/`.

## TypeScript

[`tsconfig.json`](tsconfig.json): `strict`, `noUncheckedIndexedAccess`. Types from `ponder:registry` / `ponder:schema`; no `any`. Narrow types, early returns, small functions; match local naming/import/JSDoc style.

## JSDoc (`eslint-plugin-jsdoc`)

ESLint enforces **`jsdoc/require-jsdoc`** on `src/**/*.ts` (`pnpm lint`). **Always add JSDoc where the linter flags it** — do not leave new exports, classes, or functions undocumented.

**Document:**

- Every **exported** function, class, type alias, and `const` config object you add or materially change
- **Public / meaningful** methods on services (domain mutators, static helpers with side effects)
- Non-obvious **private** helpers when the rule applies (e.g. `basinQuote` internals)

**Style (match existing services):**

- One-line summary, then `@param` / `@returns` for non-trivial signatures
- Class-level block for services: purpose, `@extends`, `@see` to schema or contract when helpful
- Skip noise on trivial one-liners only if ESLint does not require a comment (when in doubt, document)

**Before finishing TS work:** run `pnpm lint` and fix all JSDoc warnings in files you touched (not only errors).

## Agent workflow

1. **Typecheck** — Full `pnpm typecheck` expects **mainnet registry** in `generated/` (fresh, not testnet). After non-trivial TS edits, also run **`pnpm lint`** (repo root); fix issues unless excluded by task — **including JSDoc warnings** in changed files.
2. `ponder.schema.ts` or Ponder config changes: `pnpm codegen`.
3. New handler/service work: copy the closest existing file (same contract family / table); mirror `multiMapper`, services, batching, snapshots.
4. New entity services: export from [`services/index.ts`](src/services/index.ts) when shared.
5. Focused diffs; no drive-by refactors.
6. Find events: ripgrep `src/handlers/`, `generated/` for `multiMapper("Contract:Event` and ABI names. Logs: [`scripts/evgrep.sh`](scripts/evgrep.sh).
7. PR/commit: note registry version, chain id, or migration-block assumptions so later changes do not “fix” intentional behavior.

## Helpers vs services

[`src/helpers/`](src/helpers/) — utilities (`multiMapper`, `timekeeper`, `snapshotter`, IPFS, logger). Not a substitute for entity services for CRUD/domain. Handlers may use `logEvent` where appropriate. **Raw SQL:** [`sqlSafety.ts`](src/helpers/sqlSafety.ts) `bindPg*` helpers for `context.db.sql.execute` — see `test/unit/parity/raw-sql-bindings.test.ts`.

## ERC-6909 assets and reindex

- **Identity:** on-chain assets are `(centrifugeId, contract address, assetTokenId)`; ERC-20 uses `assetTokenId = 0`. `AssetService.getByToken` is the canonical lookup when events carry `tokenId` (balance sheet, spoke prices, escrow). **Vaults:** indexing assumes ERC-20 only — use `AssetService.getByTokenForVault` at deploy/sync (always `assetTokenId = 0`; ignore event `tokenId` on vault handlers); `AssetService.getForVault` loads by `vault.assetId` on vault transaction handlers.
- **Registration:** `hubRegistry:NewAsset` persists `AssetRegistration.decimals` on the hub (canonical for hub batch math). `spoke:RegisterAsset` persists `assetTokenId` and `decimals` on the spoke `Asset` row. Duplicate registrations (same token, different `assetId`) are stored for on-chain fidelity; `getByToken` resolves the **newest** row by `createdAtBlock` and logs a warning.
- **GraphQL relations:** `HoldingEscrow` and `Vault` join `Asset` via `assetId`. `OnRampAsset` / `OffRampAddress` keep address-based PKs and GraphQL lookup args (`assetAddress`) for API parity — their `asset` relation still uses `(assetAddress, centrifugeId)`.
- **Deploy / release:** ship handler and schema changes together; run `pnpm update-registry` then `pnpm codegen` before `pnpm typecheck`. **Full reindex** is required after ERC-6909 escrow/vault fixes (wrong historical `assetId` on escrows/vaults is not backfilled in place).

## Key paths

| Area             | Path                                                         |
| ---------------- | ------------------------------------------------------------ |
| Cursor rules     | `.cursor/rules/*.mdc`                                        |
| Generated        | `generated/`                                                 |
| Ponder config    | `ponder.config.ts`                                           |
| Ponder factory cache bug | [AGENTS.md § Ponder factory discovery](AGENTS.md#ponder-factory-discovery-cache-bug-pinned-ponder0166) · [ponder#2271](https://github.com/ponder-sh/ponder/issues/2271) |
| Schema           | `ponder.schema.ts`                                           |
| Base service     | `src/services/Service.ts`                                    |
| Service exports  | `src/services/index.ts`                                      |
| Logger           | `src/helpers/logger.ts`                                      |
| multiMapper      | `src/helpers/multiMapper.ts`                                 |
| snapshotter      | `src/helpers/snapshotter.ts`                                 |
| Period snapshots | `src/handlers/blockHandlers.ts`, `src/helpers/timekeeper.ts` |
| Chains           | `src/chains.ts`                                              |
| Contracts        | `src/contracts.ts`                                           |
| Basin config     | `src/config/basin.ts`                                        |
| Basin handlers   | `src/handlers/basinHandlers.ts`                              |
| Smoke hub–spoke  | [test/smoke/specs/hub-spoke.md](test/smoke/specs/hub-spoke.md) |
| Decimals resolver | `src/helpers/decimalsResolver.ts`                         |
| Hub batch epochs | `src/handlers/batchRequestManagerHandlers.ts`                |
| Vault investor   | `src/handlers/vaultHandlers.ts`                              |
| Crosschain status SQL | `src/services/crosschainStatusSql.ts` (see doc § Payload status derivation) |
| Entity provenance (`createdBy*`) | [docs/10-entity-provenance.md](docs/10-entity-provenance.md) (spec) |
