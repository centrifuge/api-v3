# Deployment environments

Helm values overrides for the `centrifuge-api-v3` chart. Each file here describes one deployed instance of this indexer: which network, which region, which image, which RPC, which DB, and which ingress host.

The chart templates live in [cfg-api-helm](../) under `charts/api-v3/`. Argo CD `Application` resources (defined in the cluster config, not in this repo) point at the published chart and pull one of these files as their values. So this directory is the source of truth for what runs where; the gitops workflows below mutate these files automatically.

## Environments

Eight files = four logical environments x two regions. Naming: `<network>[-us][-s].yaml`.

- `<network>`: `main` (mainnet) or `test` (testnet)
- `-us`: US region (eRPC via `cfg-api-erpc-us`). Absent = EU (eRPC via `cfg-api-erpc`).
- `-s`: staging. Auto-tagged from the latest Docker build on `main`. Absent = prod, promoted from staging via release-please.

| File | Network | Region | Role | Ingress host | Postgres |
| --- | --- | --- | --- | --- | --- |
| `main.yaml` | mainnet | EU | prod | `api-v3-main.cfg.embrio.tech` | own CNPG cluster |
| `main-us.yaml` | mainnet | US | prod | `api-v3-main.cfg-us.embrio.tech` | own CNPG cluster |
| `main-s.yaml` | mainnet | EU | staging | `api-v3-main-s.cfg.embrio.tech` | reuses `main` DB |
| `main-us-s.yaml` | mainnet | US | staging | `api-v3-main-s.cfg-us.embrio.tech` | reuses `main-us` DB |
| `test.yaml` | testnet | EU | prod | `api-v3-test.cfg.embrio.tech` | own CNPG cluster |
| `test-us.yaml` | testnet | US | prod | `api-v3-test.cfg-us.embrio.tech` | own CNPG cluster |
| `test-s.yaml` | testnet | EU | staging | `api-v3-test-s.cfg.embrio.tech` | reuses `test` DB |
| `test-us-s.yaml` | testnet | US | staging | `api-v3-test-s.cfg-us.embrio.tech` | reuses `test-us` DB |

Release names (used by the chart for `<release>-postgres-app`, `<release>-config`, etc.) follow `cfg-api-v3-<name>`: `cfg-api-v3-main`, `cfg-api-v3-main-us`, `cfg-api-v3-main-s`, and so on.

## Anatomy of an env file

```yaml
global:
  env:                          # ConfigMap data, mounted into indexer + query pods via envFrom
    ENVIRONMENT: "mainnet"      # "mainnet" or "testnet"; picks the registry host
    SELECTED_NETWORKS: "..."    # comma-separated chain ids to index
    REGISTRY_URL: "..."         # IPFS CID (mainnet) or https://registry.testnet.centrifuge.io (testnet)
    PONDER_RPC_URL_<chainId>: "..."  # per-chain RPC, points at eRPC
    REGISTRY_v3_1_chains_<chainId>_deployment_startBlock: "..."  # optional per-chain start block override
  apiSecretName: cfg-api-v3-rpc-keys  # k8s Secret with provider API keys (consumed by eRPC, not the pods)
  dbSecretName: cfg-api-v3-<prod>-postgres-app  # staging only; prod omits and uses the chart default

indexer:
  enabled: true|false           # staging disables when its tag matches prod (avoids duplicate indexers on the same schema)
  image:
    tag: sha-<short>             # ghcr.io/centrifuge/api-v3 image tag
  env:
    - name: NODE_OPTIONS
      value: "--max-old-space-size=1740"

query:
  enabled: true
  image:
    tag: sha-<short>
  replicaCount: 1|2              # prod runs 2, staging runs 1
  ingress:
    enabled: true
    hosts: [{ host: ..., paths: [{ path: /, pathType: Prefix }] }]
    tls: [...]

cacheJob:
  enabled: false                 # suspended CronJob for manual ponder-sync cache restore

postgres:
  enabled: true|false            # prod: true (own CNPG cluster); staging: false (reuse prod DB)
  cluster:                       # CNPG cluster config (instances, storage, walStorage)
    instances: 1
    storage: { size: 16Gi, storageClass: ceph-perf3 }
```

## How it is wired

**Chart.** `centrifuge-api-v3` lives in cfg-api-helm under `charts/api-v3/`. On push to `main` there, [`release.yml`](https://github.com/centrifuge/cfg-api-helm/blob/main/.github/workflows/release.yml) bumps the chart version, vendors subchart tarballs, and publishes the new version to GitHub Pages (`https://embrio-tech.github.io/centrifuge-helm`). Argo CD `Application`s in the cluster point at that repo + chart version and pull one file from here as values.

**Image.** `ghcr.io/centrifuge/api-v3:<tag>`, built by [`docker-build.yml`](../.github/workflows/docker-build.yml) on push to `main` (when `src/**`, `scripts/**`, or `Dockerfile` changed) and on GitHub releases. Tags include `sha-<short>`, `latest`, `main`, and semver on releases. The env files use `sha-<short>` tags.

**Database.** CloudNative-PG cluster per prod env. Prod sets `postgres.enabled: true`; the chart deploys a CNPG cluster named `<release>-postgres` and the pods read `DATABASE_URL` from its `<release>-postgres-app` secret. Staging sets `postgres.enabled: false` and `dbSecretName: cfg-api-v3-<prod>-postgres-app` to reuse the prod DB. The chart sets `DATABASE_SCHEMA` to the image tag, so each image version gets its own schema in the shared DB. This is what makes zero-downtime reindex possible: staging builds a fresh schema against the prod DB, and prod switches to that schema on promote.

**RPC.** `PONDER_RPC_URL_<chainId>` points at eRPC: `http://cfg-api-erpc:4000/main/evm/<chainId>` for EU, `http://cfg-api-erpc-us:4000/main/evm/<chainId>` for US. eRPC is a separate chart in cfg-api-helm that fronts the upstream providers (QuickNode, Alchemy, DRPC, etc.) with the keys from the `cfg-api-v3-rpc-keys` secret. Adding a chain means updating `SELECTED_NETWORKS` and adding its `PONDER_RPC_URL_<chainId>` line.

**Ingress.** Only the `query` service gets an ingress. Hosts follow `api-v3-<name>.cfg.embrio.tech` (EU) or `api-v3-<name>.cfg-us.embrio.tech` (US). TLS secrets (`cfg-api-v3-<name>-tls`) must already exist in the cluster namespace; cert-manager provisions them via the `kubernetes.io/tls-acme: "true"` annotation in the chart.

## Release flow

Releases are image-driven, not tag-driven. A code merge builds a new image, the image lands on staging automatically, smokes run against staging, and a release-please PR promotes staging tags into prod.

1. **Code merge to `main`.** [`docker-build.yml`](../.github/workflows/docker-build.yml) builds and pushes `ghcr.io/centrifuge/api-v3:sha-<short>` (plus `latest`, `main`). The `changes` job skips the build for release-only merges (version/changelog bumps) and instead retags the last code image with the new semver.
2. **Staging tag update.** [`deploy-staging.yaml`](../.github/workflows/deploy-staging.yaml) runs on `workflow_run` after a successful Docker build. It opens a gitops PR (`gitops/staging` branch) that sets `indexer.image.tag` and `query.image.tag` to `sha-<short>` in all four staging files (`main-s`, `main-us-s`, `test-s`, `test-us-s`). If the new tag already matches prod for an environment, it sets `indexer.enabled: false` on that staging file to avoid two indexers writing the same schema. The PR auto-merges (squash); Argo CD then rolls staging.
3. **Smoke tests.** [`smoke.yml`](../.github/workflows/smoke.yml) runs on release-please PRs against EU and US mainnet staging GraphQL endpoints and posts a single PR comment. Add `Smoke tests / Release PR staging (eu)` and `(us)` as required checks before merging a release.
4. **Release-please PR.** [`release.yml`](../.github/workflows/release.yml) maintains a `release-please--**` branch with `package.json` and `CHANGELOG.md` bumps. Merging it creates the GitHub release and tags the image with semver.
5. **Prod promotion.** [`deploy-prod.yaml`](../.github/workflows/deploy-prod.yaml) triggers on every push to a `release-please--**` branch. It copies `indexer.image.tag` and `query.image.tag` from each staging file into its prod counterpart (`main-s` -> `main`, `main-us-s` -> `main-us`, `test-s` -> `test`, `test-us-s` -> `test-us`) and disables staging indexers when tags match. It commits and pushes back to the release-please branch, so the release PR lands in prod when merged.
6. **Deployment record.** [`record-deployment-environments.yaml`](../.github/workflows/record-deployment-environments.yaml) runs on push to `main`. For each changed `environments/<name>.yaml` it records a GitHub deployment environment `api-v3-<name>` with URL `https://api-v3-<name>.cfg.embrio.tech`.

Net effect: merging the release-please PR promotes the staging image that was already smoke-tested into all four prod envs in one step.

## How to change an env

Open a PR against the file you want to change. Most fields are safe to edit directly.

- **Env vars / chains.** Edit `global.env`. Adding a chain requires `SELECTED_NETWORKS`, a matching `PONDER_RPC_URL_<chainId>`, and any `REGISTRY_v3_1_chains_<chainId>_deployment_startBlock` override. Removing a chain is the reverse. This changes the ConfigMap, which rolls both indexer and query.
- **Resources / probes / node options.** Edit the `indexer` or `query` block. `NODE_OPTIONS` lives under `indexer.env`.
- **Ingress / TLS.** Edit `query.ingress.hosts` and `tls`. The TLS secret must exist in the cluster namespace before you merge.
- **Replicas.** `query.replicaCount`. Prod runs 2, staging runs 1.
- **Postgres.** Only prod envs carry `postgres.enabled: true` with a CNPG cluster. Do not enable postgres on staging; staging reuses the prod DB via `dbSecretName`.
- **Image tags.** Do not edit by hand in normal operation. They flow from the gitops workflows above. To pin or rollback, set `indexer.image.tag` and `query.image.tag` to a specific `sha-<short>` (or semver) in the target file(s) and merge. For a prod rollback, also set the staging indexer back to `enabled: true` if you had disabled it.

## How to add a new environment

1. Copy the closest existing file (same network, same region) and rename to `<new-name>.yaml`.
2. Update `query.ingress.hosts` and `tls` to the new hostname and TLS secret.
3. Set `dbSecretName`: reuse a prod DB for a staging env, or omit and set `postgres.enabled: true` for a prod env with its own CNPG cluster.
4. Adjust `SELECTED_NETWORKS`, `REGISTRY_URL`, and `PONDER_RPC_URL_*` if the new env targets different chains.
5. Add the matching Argo CD `Application` in the cluster config (release name `cfg-api-v3-<new-name>`). That part lives outside this repo.
6. Merge. `record-deployment-environments.yaml` will auto-create the `api-v3-<new-name>` GitHub deployment environment on land.

## Gotchas

- **Staging indexer disable.** The gitops workflows toggle `indexer.enabled` on staging files based on tag equality with prod. If you manually pin a staging tag, make sure the enabled flag matches your intent (two indexers on the same `DATABASE_SCHEMA` will fight).
- **Schema per image.** `DATABASE_SCHEMA` is the image tag, set by the chart. Two envs sharing a DB with the same image tag share a schema. That is fine for query-only envs but not for two running indexers.
- **Registry URL.** Mainnet uses an IPFS CID pinned in `REGISTRY_URL`. Testnet uses `https://registry.testnet.centrifuge.io`. Bumping the mainnet registry means changing `REGISTRY_URL` in all four mainnet files and reindexing.
- **eRPC dependency.** Pods reach chains through eRPC (`cfg-api-erpc` / `cfg-api-erpc-us`). If eRPC is down or misconfigured, indexing and smokes both fail. The eRPC chart and its secrets are managed in cfg-api-helm, not here.
- **US vs EU host suffix.** EU hosts use `cfg.embrio.tech`; US hosts use `cfg-us.embrio.tech`. The `record-deployment-environments` workflow always records `https://api-v3-<name>.cfg.embrio.tech` as the deployment URL, which is only accurate for EU envs. Treat the recorded URL as a hint, not a source of truth, for US envs.
