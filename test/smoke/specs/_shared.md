# Shared smoke conventions

Applies to every spec in the **core suite** ([README.md](./README.md)).

## CLI entry

```bash
pnpm smoke                          # all core smokes
pnpm smoke <smokeId> [smoke-flags]
pnpm smoke list
```

## Global options

| Option | Default | Notes |
|--------|---------|-------|
| `--graphql <url>` | `GRAPHQL_URL` → `https://api.centrifuge.io/` | Indexer under test |
| `--sample <n>` | `100` | Row cap where sampling applies; `0` = unlimited |
| `--sample-seed <n>` | random | Seed for reproducible diverse sampling (CI/debug) |
| `--only <ids>` | all core | Comma-separated smoke ids |
| `--mismatches-only` | false | CI-friendly output |
| `--concurrency <n>` | `5` | Parallel RPC |
| `--rpc-batch <n>` | `20` | Batched `eth_call`s |
| `--page-size <n>` | `100` | GraphQL pagination |
| `--tolerance <wei>` | `1` | Amount slack (issuance only) |
| `--chain <name>` | — | Filter by blockchain name |
| `--centrifuge-id <id>` | — | Filter by centrifuge id |
| `--pool-id <id>` | — | Filter by pool id |
| `--token-id <hex>` | — | Filter by scId |
| `--at-block <n>` | — | Pin RPC for all reads (overrides snapshot block when set) |
| `--skip-crosschain` | true | Skip `crosschainInProgress` rows |

## Environment

- `ERPC_BASE_URL` — eRPC project base including project id (e.g. `https://erpc.cfg.embrio.tech/main`); smokes call `{base}/evm/<chainId>?secret=<ERPC_API_KEY>`
- `ERPC_API_KEY` — appended as `?secret=` query param ([eRPC auth](https://docs.erpc.cloud/config/auth))
- `ERPC_ARCHITECTURE` — optional path segment, default `evm`
- `GRAPHQL_URL` — default GraphQL when `--graphql` omitted
- When eRPC is set, smokes try eRPC first, then Chainlist-listed public RPCs as fallbacks (`test/smoke/lib/rpc.mjs` + `public-rpc.mjs`). When eRPC is unset, only public RPCs are used (verified via `node test/smoke/dev/verify-chainlist-rpcs.mjs`)
- Smokes **do not** use `PONDER_RPC_URL_*` (indexer configuration only)
- `generated/` registry files are not in git; run `pnpm update-registry` before smokes that read them (CI does this in [`.github/workflows/smoke.yml`](../../../.github/workflows/smoke.yml))

## Chain resolution

Query `blockchains { items { id centrifugeId name } }` once. **Never assume Ethereum** — each network has its own hub/spoke stack (CREATE3-same addresses, **separate state per chain**). See [hub-spoke.md](./hub-spoke.md).

Use `resolveEntityChain(ctx, row)` from `test/smoke/lib/context.mjs`:

| Priority | Field | When |
|----------|-------|------|
| 1 | `triggerChainId` | Historical snapshots — RPC at the block's chain |
| 2 | `centrifugeId` | Entity's logical network (pool, token, manager, …) |
| 3 | `blockchain.id` | EVM chain id from GraphQL relation |

Then `deployment(chainId)` for contract addresses; RPC via `ERPC_BASE_URL` / `ERPC_API_KEY` or Chainlist fallbacks (not `PONDER_RPC_URL_*`).

**`entityId` convention:** prefix with `{centrifugeId}@{chainName}:` when the same CREATE3 address can exist on multiple networks (managers, vaults). Helpers: `test/smoke/lib/hubSpoke.mjs`.

**Per-smoke routing:**

| Smoke | Chain source |
|-------|----------------|
| `pool`, `token-count` | `Pool.centrifugeId` |
| `asset` (registration) | `AssetRegistration.centrifugeId` |
| `asset` (spoke id map) | `Asset.centrifugeId` |
| `issuance`, `token-instance`, `escrow`, `vault` | row `centrifugeId` + `blockchain` |
| `onramp` | `OnOffRampManager.centrifugeId` — **one pass per `(address, centrifugeId)` row** |
| `pool-spoke-presence` | `PoolSpokeBlockchain.centrifugeId` / `blockchain` |
| `snapshots` (token/pool) | `triggerChainId` or linked `pool.centrifugeId` |
| `deployment` | each `deployment.chainId` |

## Contract addresses

From GraphQL `deployment(chainId)` — never hard-code `env/*.json`.

## Encoding

| Type | Encoding |
|------|----------|
| `PoolId` | `uint64` bigint |
| `ShareClassId` | bytes16 hex |
| `AssetId` | `uint128` bigint |

## Smoke modes

| Mode | Meaning |
|------|---------|
| **Correctness** | Each indexed row matches chain |
| **Completeness** | Chain enumeration/count proves no missing/extra GraphQL rows |

Core suite: 3 completeness smokes (`onramp`, `token-count`, `pool-spoke-presence`), 7 live correctness smokes, 1 historical smoke (`snapshots`).

### Snapshot-specific options (`snapshots` smoke)

| Option | Default |
|--------|---------|
| `--snapshots-per-type <n>` | `5` | Max snapshots per entity type (diverse random) |
| `--snapshot-triggers <csv>` | all | e.g. `period,Hub:NotifyPool` |
| `--types <csv>` | `instance,token,pool` | |
| `--since-block <n>` | — | |
| `--sample-seed <n>` | random | Reproducible shuffle |

## Diverse randomized sampling

When `--sample` (or `--snapshots-per-type`) limits checks, **do not take the first N rows** from a fixed GraphQL `orderBy` — that repeatedly hits the same pool, token, or chain.

### Goals

1. **Coverage breadth** — spread candidates across `poolId`, `tokenId` / scId, and `centrifugeId` / chain.
2. **Unbiased spot checks** — randomization avoids always testing the largest or alphabetically first entities.
3. **Reproducibility when needed** — `--sample-seed` fixes the shuffle for CI post-mortems.

### Algorithm (implement in `test/smoke/lib/sample.mjs`)

```
1. Paginate GraphQL into a candidate buffer (at least max(n * 3, 500) rows, or until exhausted).
2. Optionally pre-filter: isActive, non-zero amounts, linked vaults, etc.
3. Group candidates by stratification key(s) for the smoke:
   - token-oriented: (poolId, tokenId) or (centrifugeId, tokenId)
   - pool-oriented: poolId
   - chain-oriented: centrifugeId / chain name
4. Shuffle within each group (seeded PRNG).
5. Round-robin pick one candidate per group per pass until n reached or groups exhausted.
6. If still under n, fill remainder from shuffled leftover pool without duplicating primary keys.
```

**Example:** `--sample 20` on `tokenInstances` should yield ~many distinct `poolId`s and `tokenId`s, not 20 rows from one pool.

### Per-smoke stratification

| Smoke | Stratify by |
|-------|-------------|
| `issuance`, `token-instance` | `(centrifugeId, poolId, tokenId)` |
| `asset` | `assetId` + `centrifugeId` |
| `vault` | `(centrifugeId, poolId, tokenId)` |
| `pool` | `poolId` |
| `snapshots` | `(entity type, poolId or tokenId, blockNumber bucket)` |
| `onramp` | **Exempt** — full managers + full asset probe; see [onramp.md](./onramp.md) |

### Exemptions (no random sample, no `--sample` cap)

Run **complete** enumeration — global `--sample` / `--sample-seed` **do not apply**:

- **`onramp`** — all managers × all chain ERC-20 assets (completeness smoke)
- `deployment`, `token-count`, `pool-spoke-presence` (bounded domain)

### CLI

```bash
pnpm smoke token-instance --sample 30                    # diverse random 30
pnpm smoke snapshots --snapshots-per-type 5 --sample-seed 42
pnpm smoke asset --sample 0                            # full scan, no sampling
```

## Result shape

`{ checked, skipped, mismatches }` per smoke; exit `1` if any mismatch.
