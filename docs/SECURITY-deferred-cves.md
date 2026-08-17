# Deferred CVEs — kysely and drizzle-orm

CVEs in `kysely` and `drizzle-orm` are blocked by `ponder@0.17.5` version pins. They are deferred because they are not exploitable in this codebase and no ponder release bumps either dep to a patched version.

## Findings

| CVE | Package | Fixed in | Ponder pin | Severity |
|-----|---------|---------|-----------|----------|
| CVE-2026-32763 | kysely | 0.28.12 | ^0.26.3 | High |
| CVE-2026-33468 | kysely | 0.28.14 | ^0.26.3 | High |
| CVE-2026-44635 | kysely | 0.28.17 | ^0.26.3 | High |
| CVE-2026-39356 | drizzle-orm | 0.45.2 | 0.41.0 exact | High |

## Why not exploitable here

### kysely

All three CVEs require attacker-controlled input into JSON-path APIs (`.key()` / `.at()`) or the MySQL dialect's `sanitizeStringLiteral`.

- This indexer uses PostgreSQL only. The MySQL and SQLite dialects are not loaded.
- `src/` has zero usage of `.key()`, `.at()`, `jsonPath`, `->$`, or `->>`.
- App code imports `kysely` zero times. It is ponder-internal only, used for `ponder_sync` schema migrations and PGlite dev DB.

Evidence: `rg "\.key\(|\.at\(|jsonPath|->>|->\$" src/` returns no matches in app code.

### drizzle-orm

CVE-2026-39356 requires attacker-controlled input into `sql.identifier()` or dynamic `.as()`.

- `src/` has zero usage of `sql.identifier()`.
- All SQL identifiers go through `quotePgIdent` + `assertPgIdentSegment` in `src/helpers/sqlSafety.ts` / `src/helpers/upsertMerge.ts`, which validate against `^[a-zA-Z_][a-zA-Z0-9_-]*$` before quoting.
- Text stubs for DISTINCT FROM comparisons go through `bindPgText`, which validates against `^[a-zA-Z0-9_.-]+$` and binds via parameterized `CAST(... AS text)`.

Evidence: `rg "sql\.identifier|sql\.as\(" src/` returns no matches.

## Why override is not safe

### drizzle-orm (0.41.0 -> 0.45.2)

High risk. App code imports `drizzle-orm` directly in ~17 files (`sql`, `eq`, `getTableColumns`, `PgTableWithColumns`, `onConflictDoUpdate`). Ponder re-exports drizzle API and shares the runtime `sql` template instance. Four minor versions of API changes risk breaking `Service.saveMany` (which uses a documented `sql.raw(\`excluded."col"\`)` workaround), `onConflictDoUpdate` / `excluded` handling, and pg-core types. A version mismatch between app and ponder drizzle copies breaks `sql` template identity.

### kysely (0.26.3 -> 0.28.17)

Medium risk. App does not import kysely directly, but forcing ponder outside its declared `^0.26.3` range is untested. Failure mode: `ponder_sync` migration errors on startup, which could masquerade as the factory discovery cache bug (#2271).

## Ponder does not fix this

| ponder | drizzle-orm | kysely |
|--------|-------------|--------|
| 0.17.5 (current) | 0.41.0 exact | ^0.26.3 |
| 0.17.6 (latest 0.17.x) | 0.41.0 exact | ^0.26.3 |
| 1.0.0 (latest) | 0.39.3 exact (older) | ^0.26.3 |

## Action

Upstream issue filed on `ponder-sh/ponder` to widen `kysely` and `drizzle-orm` ranges to patched versions. Re-evaluate when ponder ships a release that bumps either dep.

## Re-scan guidance

When re-scanning, these four CVEs should be accepted or snoozed with reason: "not exploitable in this codebase; blocked by ponder version pin; tracked in docs/SECURITY-deferred-cves.md".
