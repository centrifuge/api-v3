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

[`chains.ts`](src/chains.ts) — RPC, `blocks`, deduped chains. [`contracts.ts`](src/contracts.ts) — `decorateDeploymentContracts`. [`ponder.config.ts`](ponder.config.ts) — merged `contractsV3` / `contractsV3_1`, `ordering: "omnichain"`. Optional migration blocks: [`config.ts`](src/config.ts) (`V3_1_MIGRATION_BLOCKS`).

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

[`src/helpers/`](src/helpers/) — utilities (`multiMapper`, `timekeeper`, `snapshotter`, IPFS, logger). Not a substitute for entity services for CRUD/domain. Handlers may use `logEvent` where appropriate.

## ERC-6909 assets and reindex

- **Identity:** on-chain assets are `(centrifugeId, contract address, assetTokenId)`; ERC-20 uses `assetTokenId = 0`. `AssetService.getByToken` is the canonical lookup when events carry `tokenId` (balance sheet, spoke prices, escrow). **Vaults:** indexing assumes ERC-20 only — use `AssetService.getByTokenForVault` at deploy/sync (`VAULT_ERC20_ASSET_TOKEN_ID = 0`, ignore deploy `tokenId` in handlers); `AssetService.getForVault` loads by `vault.assetId` on vault transaction handlers.
- **Registration:** `spoke:RegisterAsset` persists `assetTokenId` on the `Asset` row. Duplicate registrations (same token, different `assetId`) are stored for on-chain fidelity; `getByToken` resolves the **newest** row by `createdAtBlock` and logs a warning.
- **GraphQL relations:** `HoldingEscrow`, `Vault`, `OnRampAsset`, and `OffRampAddress` join `Asset` via `assetId`, not `address` alone.
- **Deploy / release:** ship handler and schema changes together; run `pnpm update-registry` then `pnpm codegen` before `pnpm typecheck`. **Full reindex** is required after ERC-6909 fixes or on-ramp PK changes (wrong historical `assetId` on escrows/vaults is not backfilled in place).

## Key paths

| Area             | Path                                                         |
| ---------------- | ------------------------------------------------------------ |
| Cursor rules     | `.cursor/rules/*.mdc`                                        |
| Generated        | `generated/`                                                 |
| Ponder config    | `ponder.config.ts`                                           |
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
