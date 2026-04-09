# 🌀 Centrifuge API V3

[![Deploy Pipeline](https://github.com/centrifuge/api-v3/actions/workflows/docker-build.yml/badge.svg)](https://github.com/centrifuge/api-v3/actions/workflows/docker-build.yml)
[![Centrifuge](https://img.shields.io/static/v1?label=for&message=Centrifuge&color=2762ff)](https://centrifuge.io/)
[![embrio.tech](https://img.shields.io/static/v1?label=by&message=EMBRIO.tech&color=24ae5f)](https://embrio.tech)

A blockchain event indexer for the Centrifuge protocol, built with [Ponder](https://ponder.sh/).

---

## Overview

This project indexes EVM events from smart contracts in the Centrifuge protocol, maintains a PostgreSQL database of pools, vaults, share classes, holdings, cross-chain messaging, and related entities, and exposes a GraphQL API.

## Handlers vs services

**Handlers** are Ponder entry points: they subscribe to contract logs (and blocks where used), decode `event.args`, and orchestrate what happens for each on-chain event. They live under `src/handlers/` and should stay thin—parse the event, load any needed context, then delegate to services.

**Services** are the domain and persistence layer. Each service typically wraps one Ponder/Drizzle table (or a focused set of operations) with typed helpers: query, get-or-create, updates, and business rules shared across handlers. They live under `src/services/`, usually as `class X extends Service<typeof Table>` with `static readonly entityTable` and `entityName` so shared statics (`insert`, `get`, `saveMany`, …) stay correctly typed per entity.

In short: **handlers react to the chain; services own the database model and reusable logic.**

## Getting started

### Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io/) (Corepack is enough: `corepack enable`)
- Docker (for local PostgreSQL)

### Local database (Docker Compose)

Development uses a Postgres 16 container defined in [`compose.yaml`](compose.yaml) (`postgres` user/password/database, port **5432**).

- Starting the dev server runs `docker compose up -d` automatically (`predev` in `package.json`).
- When you stop `pnpm dev`, `postdev` runs `docker compose down`.

To manage the database manually:

```bash
docker compose up -d    # start Postgres
docker compose down     # stop and remove containers (volume persists unless removed)
```

Point Ponder at the database with `DATABASE_URL` in `.env` or `.env.local`, for example:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
```

### Install and run

```bash
pnpm install --frozen-lockfile

# Environment (see .env.example): RPC keys, DATABASE_URL, optional ENVIRONMENT, etc.
cp .env.example .env.local

# Registry and ABIs (compile-time); set ENVIRONMENT=mainnet|testnet as needed
pnpm run update-registry

pnpm run codegen

# Starts Docker Postgres, then Ponder dev (port 8000, UI disabled)
pnpm dev
```

### Configuration notes

- **REGISTRY_URL** / **IPFS_GATEWAY**: optional overrides for where the registry JSON is fetched from (see [`scripts/fetch-registry.mjs`](scripts/fetch-registry.mjs)).
- **IPFS_HASH** (optional): if set, the registry is loaded from `{IPFS_GATEWAY}/{IPFS_HASH}` instead of the default `REGISTRY_URL` for the network.
- **ENVIRONMENT**: `mainnet` or `testnet`—chooses the default registry host (`https://registry.centrifuge.io/` vs `https://registry.testnet.centrifuge.io/`). Defaults to `mainnet` if unset.

### Updating registry data

Registry data is fetched at build time (and on container start in production), not at runtime, so types and ABIs stay stable.

```bash
pnpm run update-registry
# or: IPFS_HASH=<cid> pnpm run update-registry
```

This refreshes generated registry TypeScript under `generated/`.

### Production-style run (local)

```bash
pnpm build
pnpm start
```

(`prestart` runs `update-registry` before `ponder start`.)

### Ponder sync (`pnpm sync`)

`pnpm sync` runs [`scripts/cache.mjs`](scripts/cache.mjs): it downloads the published **ponder-sync** snapshot from GitHub Container Registry (`ghcr.io`, artifact name `ponder-sync`) and restores it into the database given by **`DATABASE_URL`**.

**Mainnet only.** The script requires `ENVIRONMENT=mainnet`. If `ENVIRONMENT` is missing or set to anything else (including `testnet`), it prints `Skipping cache download: ENVIRONMENT is not mainnet.` and exits without downloading or restoring. This is stricter than `update-registry`, which defaults to mainnet when `ENVIRONMENT` is unset.

Optional artifact tag: pass `--tag <tag>`, `-t <tag>`, or a single positional argument; `latest` or a numeric tag (see script validation).

Related maintainer scripts: `pnpm sync:export` (dump `ponder_sync` schema from the local Docker Postgres) and `pnpm sync:push` (publish a snapshot to GHCR).

## Database schema

The indexer maintains structured tables for pools, tokens, vaults, epochs, investor flows, holdings, escrows, cross-chain payloads, and related entities. See the Ponder schema in the repo and the GraphQL schema Ponder serves when running.

## API

While the process is running, Ponder serves a GraphQL API; the URL is printed in the logs (dev default port **8000**).

The public production GraphQL endpoint used for schema checks in this repo is [https://api.centrifuge.io](https://api.centrifuge.io).

## Deployment environments

Helm values in [`environments/`](environments/) describe how the app is deployed (indexer + query, ingress hosts, env vars). Summary:

| Environment | Network   | GraphQL host (ingress)          |
| ----------- | --------- | ------------------------------- |
| `main`      | `mainnet` | `api-v3-main.cfg.embrio.tech`   |
| `main-s`    | `mainnet` | `api-v3-main-s.cfg.embrio.tech` |
| `test`      | `testnet` | `api-v3-test.cfg.embrio.tech`   |
| `test-s`    | `testnet` | `api-v3-test-s.cfg.embrio.tech` |

Container images are built and pushed to **GitHub Container Registry** (`ghcr.io/centrifuge/api-v3`) on pushes to `main` and on releases (see [`.github/workflows/docker-build.yml`](.github/workflows/docker-build.yml)). The production image sets `DATABASE_SCHEMA=app` and runs `fetch-registry` on entry.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT](/LICENSE) License
