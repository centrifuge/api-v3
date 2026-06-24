#!/usr/bin/env node
/**
 * Compare on/off-ramp manager configuration from on-chain view calls against indexed
 * children (onRampAsset, offrampRelayer, offRampAddress) via GraphQL + RPC.
 *
 * On-chain ground truth (no log replay):
 *   - Onramps: probe onramp(asset) for every ERC-20 asset on the manager's chain
 *   - Relayers: probe relayer(addr) for candidate addresses from indexed relayers (+ --relayer)
 *   - Offramps: probe offramp(asset, receiver) for enabled onramps × receiver candidates (+ --receiver)
 *
 * Usage:
 *   node scripts/verify-onofframp-children.mjs --all-managers --mismatches-only
 *   node scripts/verify-onofframp-children.mjs --chain avalanche --pool-id 281474976710671
 *   node scripts/verify-onofframp-children.mjs --token-id 0x000100000000000f0000000000000001 --centrifuge-id 5
 *   node scripts/verify-onofframp-children.mjs --receiver 0xa5aaf18275cb27245e6d0f6bf2bbcbb0f9bf2498
 *
 * Env: RPC URLs from `.env.local` (`PONDER_RPC_URL_<chainId>`, comma-separated).
 * GraphQL: `--graphql <URL>` or `GRAPHQL_URL` in `.env.local` (default: https://api.centrifuge.io/).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createPublicClient, defineChain, fallback, http, parseAbi } from "viem";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

const DEFAULT_GRAPHQL = "https://api.centrifuge.io/";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_RPC_BATCH = 20;

const ON_OFF_RAMP_VIEW_ABI = parseAbi([
  "function onramp(address asset) view returns (bool)",
  "function relayer(address relayer) view returns (bool)",
  "function offramp(address asset, address receiver) view returns (bool)",
]);

/** @typedef {"MISSING_ONRAMP"|"MISSING_RELAYER"|"MISSING_OFFRAMP"|"PROBE_FAILED"} IssueKind */

/**
 * @param {string} flag
 * @param {string[]} argv
 */
function readFlag(flag, argv) {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  return argv[i + 1];
}

/**
 * @param {string} flag
 * @param {string[]} argv
 */
function hasFlag(flag, argv) {
  return argv.includes(flag);
}

/**
 * @param {string} flag
 * @param {string[]} argv
 * @returns {string[]}
 */
function readFlagList(flag, argv) {
  /** @type {string[]} */
  const values = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && argv[i + 1]) {
      values.push(
        ...argv[i + 1]
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      );
    }
  }
  return values;
}

/**
 * @param {string} url
 * @param {string} query
 * @param {Record<string, unknown>} [variables]
 */
async function gql(url, query, variables) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  return body.data;
}

function usage() {
  console.error(`Usage: verify-onofframp-children.mjs [options]

Compares on-chain onramp/relayer/offramp view calls against indexed children
(by tokenId + centrifugeId). Does not replay manager events.

Options:
  --all-managers          Check every indexed onOffRampManager (default when no filters)
  --chain <NAME>          Filter by blockchain name (avalanche, arbitrum, …)
  --centrifuge-id <ID>    Filter by centrifugeId
  --pool-id <ID>          Filter by poolId
  --token-id <HEX>        Filter by share class id (scId)
  --manager <ADDRESS>     Filter by manager contract address
  --relayer <ADDR>        Extra relayer candidate to probe (repeatable; comma-separated ok)
  --receiver <ADDR>       Extra offramp receiver candidate to probe (repeatable; comma-separated ok)
  --graphql <URL>         GraphQL endpoint (or GRAPHQL_URL; default: ${DEFAULT_GRAPHQL})
  --page-size <N>         GraphQL page size (default: ${DEFAULT_PAGE_SIZE})
  --rpc-batch <N>         Parallel eth_call batch size (default: ${DEFAULT_RPC_BATCH})
  --concurrency <N>       Parallel manager checks (default: ${DEFAULT_CONCURRENCY})
  --mismatches-only       Print only issues (no OK summary lines)
  --help                  Show this help

Exit code 1 when any issue is found.
`);
}

/**
 * @param {number} chainId
 */
function rpcUrlsForChain(chainId) {
  const envRpc = process.env[`PONDER_RPC_URL_${chainId}`];
  if (!envRpc) return [];
  return envRpc
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

/**
 * @param {string[]} argv
 */
function resolveGraphqlUrl(argv) {
  const fromFlag = readFlag("--graphql", argv);
  if (fromFlag) return fromFlag;
  const fromEnv = process.env.GRAPHQL_URL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_GRAPHQL;
}

/**
 * @param {number} chainId
 */
function rpcClientForChain(chainId) {
  const rpcUrls = rpcUrlsForChain(chainId);
  if (rpcUrls.length === 0) {
    throw new Error(
      `No RPC for chainId ${chainId}. Set PONDER_RPC_URL_${chainId} in .env.local`
    );
  }
  const chain = defineChain({
    id: chainId,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    name: `chain-${chainId}`,
    rpcUrls: { default: { http: rpcUrls } },
  });
  return createPublicClient({
    chain,
    transport:
      rpcUrls.length === 1 ? http(rpcUrls[0]) : fallback(rpcUrls.map((url) => http(url))),
  });
}

/**
 * @param {string} addr
 */
function normAddr(addr) {
  return addr.toLowerCase();
}

/**
 * @param {string} asset
 * @param {string} receiver
 */
function offrampKey(asset, receiver) {
  return `${normAddr(asset)}|${normAddr(receiver)}`;
}

const BLOCKCHAINS_QUERY = `
  query Blockchains {
    blockchains(limit: 50) {
      items {
        centrifugeId
        id
        name
      }
    }
  }
`;

const MANAGERS_PAGE_QUERY = `
  query OnOffRampManagers($limit: Int!, $after: String, $where: OnOffRampManagerFilter) {
    onOffRampManagers(
      limit: $limit
      after: $after
      orderBy: "address"
      orderDirection: "asc"
      where: $where
    ) {
      items {
        address
        centrifugeId
        poolId
        tokenId
      }
      pageInfo {
        endCursor
        hasNextPage
      }
      totalCount
    }
  }
`;

const CHILDREN_QUERY = `
  query RampChildren($tokenId: String!, $centrifugeId: String!, $limit: Int!) {
    onRampAssets(where: { tokenId: $tokenId, centrifugeId: $centrifugeId }, limit: $limit) {
      items { assetAddress isEnabled }
      totalCount
    }
    offrampRelayers(where: { tokenId: $tokenId, centrifugeId: $centrifugeId }, limit: $limit) {
      items { address isEnabled }
      totalCount
    }
    offRampAddresss(where: { tokenId: $tokenId, centrifugeId: $centrifugeId }, limit: $limit) {
      items { assetAddress receiverAddress isEnabled }
      totalCount
    }
  }
`;

const ASSETS_PAGE_QUERY = `
  query ChainAssets($limit: Int!, $after: String, $where: AssetFilter) {
    assets(limit: $limit, after: $after, orderBy: "id", orderDirection: "asc", where: $where) {
      items { address assetTokenId }
      pageInfo { endCursor hasNextPage }
      totalCount
    }
  }
`;

const RELAYERS_PAGE_QUERY = `
  query RelayerCandidates($limit: Int!, $after: String, $where: OfframpRelayerFilter) {
    offrampRelayers(limit: $limit, after: $after, orderBy: "address", orderDirection: "asc", where: $where) {
      items { address }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

const RECEIVERS_PAGE_QUERY = `
  query ReceiverCandidates($limit: Int!, $after: String, $where: OffRampAddressFilter) {
    offRampAddresss(limit: $limit, after: $after, orderBy: "receiverAddress", orderDirection: "asc", where: $where) {
      items { receiverAddress }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

/**
 * @param {string} graphqlUrl
 */
async function fetchBlockchainMap(graphqlUrl) {
  const data = await gql(graphqlUrl, BLOCKCHAINS_QUERY);
  /** @type {Map<string, { chainId: number; name: string }>} */
  const map = new Map();
  for (const row of data.blockchains?.items ?? []) {
    map.set(String(row.centrifugeId), {
      chainId: Number(row.id),
      name: row.name,
    });
  }
  return map;
}

/**
 * @param {string} graphqlUrl
 * @param {string} query
 * @param {Record<string, string>|undefined} where
 * @param {number} pageSize
 */
async function paginateGraphql(graphqlUrl, query, where, pageSize) {
  /** @type {unknown[]} */
  const items = [];
  let after = null;
  while (true) {
    const data = await gql(graphqlUrl, query, {
      limit: pageSize,
      after,
      where: where && Object.keys(where).length > 0 ? where : undefined,
    });
    const pageKey = Object.keys(data).find((k) => data[k]?.items);
    const pageResult = pageKey ? data[pageKey] : null;
    const pageItems = pageResult?.items ?? [];
    items.push(...pageItems);
    if (!pageResult?.pageInfo?.hasNextPage) break;
    after = pageResult.pageInfo.endCursor;
  }
  return items;
}

/**
 * @param {string} graphqlUrl
 * @param {Record<string, string>} where
 * @param {number} pageSize
 */
async function fetchAllManagers(graphqlUrl, where, pageSize) {
  /** @type {Array<{ address: string; centrifugeId: string; poolId: string; tokenId: string }>} */
  const managers = [];
  let after = null;
  let page = 0;
  let totalCount = null;

  while (true) {
    page += 1;
    const data = await gql(graphqlUrl, MANAGERS_PAGE_QUERY, {
      limit: pageSize,
      after,
      where: Object.keys(where).length > 0 ? where : undefined,
    });
    const pageResult = data.onOffRampManagers;
    const items = pageResult?.items ?? [];
    if (totalCount === null && pageResult?.totalCount != null) {
      totalCount = pageResult.totalCount;
    }
    managers.push(...items);
    process.stderr.write(
      `\rFetched ${managers.length}${totalCount != null ? `/${totalCount}` : ""} manager(s) (page ${page})...`
    );
    if (!pageResult?.pageInfo?.hasNextPage) break;
    after = pageResult.pageInfo.endCursor;
  }
  process.stderr.write("\n");
  return managers;
}

/**
 * @param {string} graphqlUrl
 * @param {string} tokenId
 * @param {string} centrifugeId
 */
async function fetchIndexedChildren(graphqlUrl, tokenId, centrifugeId) {
  const data = await gql(graphqlUrl, CHILDREN_QUERY, {
    tokenId,
    centrifugeId,
    limit: 500,
  });
  return {
    onRampAssets: data.onRampAssets?.items ?? [],
    offrampRelayers: data.offrampRelayers?.items ?? [],
    offRampAddresses: data.offRampAddresss?.items ?? [],
  };
}

/**
 * ERC-20 asset addresses registered on a spoke chain (assetTokenId = 0).
 * @param {string} graphqlUrl
 * @param {string} centrifugeId
 * @param {number} pageSize
 */
async function fetchChainErc20Assets(graphqlUrl, centrifugeId, pageSize) {
  const rows = await paginateGraphql(
    graphqlUrl,
    ASSETS_PAGE_QUERY,
    { centrifugeId },
    pageSize
  );
  return rows
    .filter((row) => String(row.assetTokenId) === "0" && row.address)
    .map((row) => normAddr(row.address));
}

/**
 * Unique relayer addresses from indexed rows (chain-scoped + global union).
 * @param {string} graphqlUrl
 * @param {string} centrifugeId
 * @param {string[]} extra
 * @param {number} pageSize
 */
async function fetchRelayerCandidates(graphqlUrl, centrifugeId, extra, pageSize) {
  const chainRows = await paginateGraphql(
    graphqlUrl,
    RELAYERS_PAGE_QUERY,
    { centrifugeId },
    pageSize
  );
  const globalRows = await paginateGraphql(graphqlUrl, RELAYERS_PAGE_QUERY, undefined, pageSize);
  const set = new Set([
    ...chainRows.map((r) => normAddr(r.address)),
    ...globalRows.map((r) => normAddr(r.address)),
    ...extra.map(normAddr),
  ]);
  return [...set];
}

/**
 * Unique receiver addresses from indexed rows (chain-scoped + global union).
 * @param {string} graphqlUrl
 * @param {string} centrifugeId
 * @param {string[]} extra
 * @param {number} pageSize
 */
async function fetchReceiverCandidates(graphqlUrl, centrifugeId, extra, pageSize) {
  const chainRows = await paginateGraphql(
    graphqlUrl,
    RECEIVERS_PAGE_QUERY,
    { centrifugeId },
    pageSize
  );
  const globalRows = await paginateGraphql(graphqlUrl, RECEIVERS_PAGE_QUERY, undefined, pageSize);
  const set = new Set([
    ...chainRows.map((r) => normAddr(r.receiverAddress)),
    ...globalRows.map((r) => normAddr(r.receiverAddress)),
    ...extra.map(normAddr),
  ]);
  return [...set];
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} batchSize
 * @param {(item: T) => Promise<void>} fn
 */
async function forEachBatch(items, batchSize, fn) {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
  }
}

/**
 * @param {import('viem').PublicClient} client
 * @param {`0x${string}`} managerAddress
 * @param {string[]} assets
 * @param {number} batchSize
 */
async function probeEnabledOnramps(client, managerAddress, assets, batchSize) {
  /** @type {string[]} */
  const enabled = [];
  await forEachBatch(assets, batchSize, async (asset) => {
    const ok = await client.readContract({
      address: managerAddress,
      abi: ON_OFF_RAMP_VIEW_ABI,
      functionName: "onramp",
      args: [asset],
    });
    if (ok) enabled.push(normAddr(asset));
  });
  return enabled;
}

/**
 * @param {import('viem').PublicClient} client
 * @param {`0x${string}`} managerAddress
 * @param {string[]} relayers
 * @param {number} batchSize
 */
async function probeEnabledRelayers(client, managerAddress, relayers, batchSize) {
  /** @type {string[]} */
  const enabled = [];
  await forEachBatch(relayers, batchSize, async (relayer) => {
    const ok = await client.readContract({
      address: managerAddress,
      abi: ON_OFF_RAMP_VIEW_ABI,
      functionName: "relayer",
      args: [relayer],
    });
    if (ok) enabled.push(normAddr(relayer));
  });
  return enabled;
}

/**
 * @param {import('viem').PublicClient} client
 * @param {`0x${string}`} managerAddress
 * @param {string[]} assets
 * @param {string[]} receivers
 * @param {number} batchSize
 */
async function probeEnabledOfframps(client, managerAddress, assets, receivers, batchSize) {
  /** @type {string[]} */
  const enabled = [];
  const pairs = [];
  for (const asset of assets) {
    for (const receiver of receivers) {
      pairs.push({ asset, receiver });
    }
  }
  await forEachBatch(pairs, batchSize, async ({ asset, receiver }) => {
    const ok = await client.readContract({
      address: managerAddress,
      abi: ON_OFF_RAMP_VIEW_ABI,
      functionName: "offramp",
      args: [asset, receiver],
    });
    if (ok) enabled.push(offrampKey(asset, receiver));
  });
  return enabled;
}

/**
 * @param {object} ctx
 * @param {IssueKind} kind
 * @param {string} detail
 */
function pushIssue(ctx, kind, detail) {
  ctx.issues.push({ kind, detail, manager: ctx.managerLabel });
}

/**
 * @param {{
 *   manager: { address: string; centrifugeId: string; poolId: string; tokenId: string };
 *   chainName: string;
 *   chainId: number;
 *   graphqlUrl: string;
 *   pageSize: number;
 *   rpcBatch: number;
 *   extraRelayers: string[];
 *   extraReceivers: string[];
 * }} opts
 */
async function checkManager(opts) {
  const {
    manager,
    chainName,
    chainId,
    graphqlUrl,
    pageSize,
    rpcBatch,
    extraRelayers,
    extraReceivers,
  } = opts;
  const managerLabel = `${chainName} manager=${manager.address} pool=${manager.poolId} scId=${manager.tokenId}`;
  /** @type {{ managerLabel: string; issues: Array<{ kind: IssueKind; detail: string; manager: string }> }} */
  const ctx = { managerLabel, issues: [] };

  const client = rpcClientForChain(chainId);
  const managerAddress = manager.address;

  process.stderr.write(`\n${managerLabel}\n`);

  const [chainAssets, relayerCandidates, receiverCandidates, indexed] = await Promise.all([
    fetchChainErc20Assets(graphqlUrl, manager.centrifugeId, pageSize),
    fetchRelayerCandidates(graphqlUrl, manager.centrifugeId, extraRelayers, pageSize),
    fetchReceiverCandidates(graphqlUrl, manager.centrifugeId, extraReceivers, pageSize),
    fetchIndexedChildren(graphqlUrl, manager.tokenId, manager.centrifugeId),
  ]);

  process.stderr.write(
    `  probing ${chainAssets.length} asset(s), ${relayerCandidates.length} relayer candidate(s), ${receiverCandidates.length} receiver candidate(s)...\n`
  );

  const onrampProbeAssets = [
    ...new Set([
      ...chainAssets,
      ...indexed.onRampAssets.map((r) => normAddr(r.assetAddress)),
    ]),
  ];
  const offrampProbeAssets = [
    ...new Set([
      ...indexed.onRampAssets.map((r) => normAddr(r.assetAddress)),
      ...indexed.offRampAddresses.map((r) => normAddr(r.assetAddress)),
    ]),
  ];

  const [enabledOnramps, enabledRelayers, enabledOfframpsFromProbe] = await Promise.all([
    probeEnabledOnramps(client, managerAddress, onrampProbeAssets, rpcBatch),
    probeEnabledRelayers(client, managerAddress, relayerCandidates, rpcBatch),
    probeEnabledOfframps(
      client,
      managerAddress,
      onrampProbeAssets.length > 0 ? onrampProbeAssets : offrampProbeAssets,
      receiverCandidates,
      rpcBatch
    ),
  ]);

  const expected = {
    enabledOnramps,
    enabledRelayers,
    enabledOfframps: enabledOfframpsFromProbe,
  };

  const indexedOnrampsEnabled = new Map(
    indexed.onRampAssets
      .filter((r) => r.isEnabled)
      .map((r) => [normAddr(r.assetAddress), true])
  );
  const indexedRelayersEnabled = new Map(
    indexed.offrampRelayers
      .filter((r) => r.isEnabled)
      .map((r) => [normAddr(r.address), true])
  );
  const indexedOfframpsEnabled = new Map(
    indexed.offRampAddresses
      .filter((r) => r.isEnabled)
      .map((r) => [offrampKey(r.assetAddress, r.receiverAddress), true])
  );

  for (const asset of expected.enabledOnramps) {
    if (!indexedOnrampsEnabled.has(asset)) {
      const anyRow = indexed.onRampAssets.find((r) => normAddr(r.assetAddress) === asset);
      pushIssue(
        ctx,
        "MISSING_ONRAMP",
        anyRow
          ? `asset ${asset} enabled on-chain but indexed isEnabled=${anyRow.isEnabled}`
          : `asset ${asset} enabled on-chain but not indexed`
      );
    }
  }

  for (const relayer of expected.enabledRelayers) {
    if (!indexedRelayersEnabled.has(relayer)) {
      const anyRow = indexed.offrampRelayers.find((r) => normAddr(r.address) === relayer);
      pushIssue(
        ctx,
        "MISSING_RELAYER",
        anyRow
          ? `relayer ${relayer} enabled on-chain but indexed isEnabled=${anyRow.isEnabled}`
          : `relayer ${relayer} enabled on-chain but not indexed`
      );
    }
  }

  for (const key of expected.enabledOfframps) {
    if (!indexedOfframpsEnabled.has(key)) {
      const [asset, receiver] = key.split("|");
      const anyRow = indexed.offRampAddresses.find(
        (r) => offrampKey(r.assetAddress, r.receiverAddress) === key
      );
      pushIssue(
        ctx,
        "MISSING_OFFRAMP",
        anyRow
          ? `offramp ${asset} → ${receiver} enabled on-chain but indexed isEnabled=${anyRow.isEnabled}`
          : `offramp ${asset} → ${receiver} enabled on-chain but not indexed`
      );
    }
  }

  return {
    chainName,
    poolId: manager.poolId,
    tokenId: manager.tokenId,
    managerAddress: manager.address,
    managerLabel,
    issues: ctx.issues,
    summary: {
      probedAssets: onrampProbeAssets.length,
      probedRelayers: relayerCandidates.length,
      probedReceivers: receiverCandidates.length,
      expectedOnramps: expected.enabledOnramps.length,
      expectedRelayers: expected.enabledRelayers.length,
      expectedOfframps: expected.enabledOfframps.length,
      indexedOnramps: indexed.onRampAssets.length,
      indexedRelayers: indexed.offrampRelayers.length,
      indexedOfframps: indexed.offRampAddresses.length,
    },
  };
}

/**
 * @typedef {{
 *   chainName: string;
 *   poolId: string;
 *   tokenId?: string;
 *   managerAddress?: string;
 *   managerLabel: string;
 *   issues: Array<{ kind: IssueKind; detail: string; manager: string }>;
 *   summary: Record<string, number>;
 * }} ManagerCheckResult
 */

/**
 * @param {ManagerCheckResult[]} results
 * @param {boolean} mismatchesOnly
 */
function printGroupedReport(results, mismatchesOnly) {
  /** @type {Map<string, Map<string, ManagerCheckResult[]>>} */
  const byNetwork = new Map();

  for (const result of results) {
    const network = result.chainName || "unknown";
    const pool = String(result.poolId ?? "unknown");
    if (!byNetwork.has(network)) byNetwork.set(network, new Map());
    const byPool = byNetwork.get(network);
    if (!byPool.has(pool)) byPool.set(pool, []);
    byPool.get(pool).push(result);
  }

  const networks = [...byNetwork.keys()].sort((a, b) => a.localeCompare(b));

  for (const network of networks) {
    const byPool = byNetwork.get(network);
    const pools = [...byPool.keys()].sort((a, b) => {
      try {
        const diff = BigInt(a) - BigInt(b);
        return diff < 0n ? -1 : diff > 0n ? 1 : 0;
      } catch {
        return a.localeCompare(b);
      }
    });

    console.log(`\nNetwork: ${network}`);

    for (const poolId of pools) {
      const poolResults = byPool.get(poolId);
      const poolIssues = poolResults.reduce((n, r) => n + r.issues.length, 0);
      const poolOk = poolResults.filter((r) => r.issues.length === 0).length;

      console.log(`  Pool: ${poolId}  (${poolOk} OK, ${poolIssues} issue(s))`);

      for (const result of poolResults) {
        const managerLine = result.managerAddress
          ? `manager=${result.managerAddress}${result.tokenId ? ` scId=${result.tokenId}` : ""}`
          : result.managerLabel;

        if (result.issues.length === 0) {
          if (!mismatchesOnly) {
            const s = result.summary;
            console.log(
              `    OK  ${managerLine}  on-chain=${s.expectedOnramps}/${s.expectedRelayers}/${s.expectedOfframps}  indexed=${s.indexedOnramps}/${s.indexedRelayers}/${s.indexedOfframps}`
            );
          }
          continue;
        }

        console.log(`    ${managerLine}`);
        for (const issue of result.issues) {
          console.log(`      ${issue.kind}  ${issue.detail}`);
        }
      }
    }
  }
}

/**
 * @param {Array<() => Promise<unknown>>} tasks
 * @param {number} concurrency
 */
async function runPool(tasks, concurrency) {
  /** @type {unknown[]} */
  const results = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  if (hasFlag("--help", argv)) {
    usage();
    process.exit(0);
  }

  const graphqlUrl = resolveGraphqlUrl(argv);
  const pageSize = Number(readFlag("--page-size", argv) ?? String(DEFAULT_PAGE_SIZE));
  const rpcBatch = Number(readFlag("--rpc-batch", argv) ?? String(DEFAULT_RPC_BATCH));
  const concurrency = Number(readFlag("--concurrency", argv) ?? String(DEFAULT_CONCURRENCY));
  const mismatchesOnly = hasFlag("--mismatches-only", argv);
  const extraRelayers = readFlagList("--relayer", argv);
  const extraReceivers = readFlagList("--receiver", argv);
  const allManagers =
    hasFlag("--all-managers", argv) ||
    (!readFlag("--chain", argv) &&
      !readFlag("--centrifuge-id", argv) &&
      !readFlag("--pool-id", argv) &&
      !readFlag("--token-id", argv) &&
      !readFlag("--manager", argv));

  if (!allManagers && !readFlag("--chain", argv) && !readFlag("--centrifuge-id", argv)) {
    console.error("Specify filters or --all-managers");
    usage();
    process.exit(2);
  }

  /** @type {Record<string, string>} */
  const where = {};
  const chainFilter = readFlag("--chain", argv);
  const centrifugeFilter = readFlag("--centrifuge-id", argv);
  const poolFilter = readFlag("--pool-id", argv);
  const tokenFilter = readFlag("--token-id", argv);
  const managerFilter = readFlag("--manager", argv);

  if (centrifugeFilter) where.centrifugeId = centrifugeFilter;
  if (poolFilter) where.poolId = poolFilter;
  if (tokenFilter) where.tokenId = tokenFilter;
  if (managerFilter) where.address = managerFilter;

  const blockchainMap = await fetchBlockchainMap(graphqlUrl);
  if (chainFilter) {
    const match = [...blockchainMap.entries()].find(([, v]) => v.name === chainFilter);
    if (!match) {
      console.error(
        `Unknown --chain ${chainFilter}. Known: ${[...blockchainMap.values()].map((v) => v.name).join(", ")}`
      );
      process.exit(2);
    }
    if (centrifugeFilter && centrifugeFilter !== match[0]) {
      console.error(`--chain ${chainFilter} conflicts with --centrifuge-id ${centrifugeFilter}`);
      process.exit(2);
    }
    where.centrifugeId = match[0];
  }

  const managers = await fetchAllManagers(graphqlUrl, where, pageSize);
  if (managers.length === 0) {
    console.log("No onOffRampManager rows match filters.");
    process.exit(0);
  }

  /** @type {Array<() => Promise<ManagerCheckResult>>} */
  const tasks = managers.map((manager) => async () => {
    const chain = blockchainMap.get(String(manager.centrifugeId));
    if (!chain) {
      return {
        chainName: "unknown",
        poolId: manager.poolId,
        tokenId: manager.tokenId,
        managerAddress: manager.address,
        managerLabel: `unknown-chain centrifugeId=${manager.centrifugeId} ${manager.address}`,
        issues: [
          {
            kind: "PROBE_FAILED",
            detail: `no blockchain row for centrifugeId ${manager.centrifugeId}`,
            manager: manager.address,
          },
        ],
        summary: {},
      };
    }
    try {
      return await checkManager({
        manager,
        chainName: chain.name,
        chainId: chain.chainId,
        graphqlUrl,
        pageSize,
        rpcBatch,
        extraRelayers,
        extraReceivers,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        chainName: chain.name,
        poolId: manager.poolId,
        tokenId: manager.tokenId,
        managerAddress: manager.address,
        managerLabel: `${chain.name} ${manager.address}`,
        issues: [{ kind: "PROBE_FAILED", detail: `check failed: ${msg}`, manager: manager.address }],
        summary: {},
      };
    }
  });

  const results = /** @type {ManagerCheckResult[]} */ (await runPool(tasks, concurrency));
  /** @type {Array<{ kind: IssueKind; detail: string; manager: string }>} */
  const allIssues = [];
  let okCount = 0;

  for (const result of results) {
    if (!result) continue;
    if (result.issues.length === 0) okCount += 1;
    else allIssues.push(...result.issues);
  }

  console.log("\n── On/off-ramp verification report ──");
  printGroupedReport(results.filter(Boolean), mismatchesOnly);

  const networkCount = new Set(results.map((r) => r?.chainName).filter(Boolean)).size;
  const poolCount = new Set(results.map((r) => `${r?.chainName}:${r?.poolId}`).filter(Boolean)).size;

  console.log(
    `\nChecked ${managers.length} manager(s) across ${networkCount} network(s), ${poolCount} pool(s): ${okCount} OK, ${allIssues.length} issue(s)`
  );

  if (allIssues.length > 0) {
    const byKind = /** @type {Record<string, number>} */ ({});
    for (const issue of allIssues) {
      byKind[issue.kind] = (byKind[issue.kind] ?? 0) + 1;
    }
    console.log("By kind:", Object.entries(byKind).map(([k, n]) => `${k}=${n}`).join(", "));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
