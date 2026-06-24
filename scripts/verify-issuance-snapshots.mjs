#!/usr/bin/env node
/**
 * Compare token_instance issuance in the indexer (live + period snapshots) against
 * on-chain ERC-20 totalSupply at the same block via GraphQL + RPC.
 *
 * Usage:
 *   node scripts/verify-issuance-snapshots.mjs --symbol ACRDX --chain plume --since-creation
 *   node scripts/verify-issuance-snapshots.mjs --token-id 0x0001... --snapshots 5
 *   node scripts/verify-issuance-snapshots.mjs --symbol ACRDX --since-creation --mismatches-only
 *   node scripts/verify-issuance-snapshots.mjs --all-instances --mismatches-only
 *   node scripts/verify-issuance-snapshots.mjs --symbol ACRDX --graphql http://localhost:8000/graphql
 *   GRAPHQL_URL=http://127.0.0.1:8000/graphql pnpm verify:issuance:all
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
const ERC20_ABI = parseAbi(["function totalSupply() view returns (uint256)"]);

/**
 * RPC URLs for a chain — same convention as `src/chains.ts` (`PONDER_RPC_URL_<chainId>`).
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
 * GraphQL endpoint: `--graphql` flag, then `GRAPHQL_URL` from env, then production default.
 * @param {string[]} argv
 */
function resolveGraphqlUrl(argv) {
  const fromFlag = readFlag("--graphql", argv);
  if (fromFlag) return fromFlag;
  const fromEnv = process.env.GRAPHQL_URL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_GRAPHQL;
}

function usage() {
  console.error(`Usage: verify-issuance-snapshots.mjs [options]

Options:
  --symbol <SYMBOL>       Share token symbol (e.g. ACRDX)
  --token-id <HEX>        Share class id (scId); alternative to --symbol
  --all-instances         Every active tokenInstance (latest snapshot only by default)
  --chain <NAME>          Filter to one chain (plume, ethereum, monad, …)
  --graphql <URL>         GraphQL endpoint (or set GRAPHQL_URL in .env.local; default: ${DEFAULT_GRAPHQL})
  --since-creation        Walk every period snapshot from first to latest (paginated)
  --snapshots <N>         Only check the N most recent snapshots (default: 5; 1 with --all-instances)
  --with-live             With --all-instances: also check live totalIssuance vs chain tip
  --latest-snapshot-only  Single-token mode: skip live check (snapshots only)
  --concurrency <N>       Parallel RPC checks for --all-instances (default: 5)
  --page-size <N>         GraphQL page size when paginating (default: ${DEFAULT_PAGE_SIZE})
  --mismatches-only       Print only material mismatches (ignores dust within --tolerance)
  --tolerance <WEI>       Treat |delta| <= tolerance as match (default: 1)
  --help                  Show this help
`);
}

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

/**
 * @param {bigint} value
 * @param {number} decimals
 */
function formatAmount(value, decimals) {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "") || "0";
  return `${neg ? "-" : ""}${whole.toString()}${fracStr === "0" ? "" : `.${fracStr}`}`;
}

/**
 * @param {bigint} indexed
 * @param {bigint} onchain
 * @param {number} decimals
 * @param {bigint} toleranceWei
 */
function diffLine(indexed, onchain, decimals, toleranceWei = 1n) {
  const delta = indexed - onchain;
  const absDelta = delta < 0n ? -delta : delta;
  const pct =
    onchain === 0n
      ? indexed === 0n
        ? "0"
        : "∞"
      : ((Number(delta) / Number(onchain)) * 100).toFixed(4);
  return {
    delta,
    absDelta,
    deltaFmt: formatAmount(delta, decimals),
    pct,
    match: absDelta <= toleranceWei,
    material: absDelta > 10n ** 12n,
  };
}

/**
 * @param {number} chainId
 */
function rpcClientForChain(chainId) {
  const rpcUrls = rpcUrlsForChain(chainId);
  if (rpcUrls.length === 0) {
    throw new Error(
      `No RPC for chainId ${chainId}. Set PONDER_RPC_URL_${chainId} in .env.local at project root`
    );
  }
  const chain = defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: rpcUrls } },
  });
  return createPublicClient({
    chain,
    transport:
      rpcUrls.length === 1 ? http(rpcUrls[0]) : fallback(rpcUrls.map((url) => http(url))),
  });
}

/**
 * @param {import("viem").PublicClient} client
 * @param {`0x${string}`} address
 * @param {bigint | undefined} blockNumber
 */
async function readTotalSupplyAtBlock(client, address, blockNumber) {
  return client.readContract({
    address,
    abi: ERC20_ABI,
    functionName: "totalSupply",
    blockNumber,
  });
}

const TOKEN_BY_SYMBOL_QUERY = `
  query TokenBySymbol($symbol: String!) {
    tokens(where: { symbol: $symbol }, limit: 1) {
      items {
        id
        symbol
        name
        decimals
        totalIssuance
        tokenInstances {
          items {
            centrifugeId
            address
            totalIssuance
            decimals
            createdAtBlock
            blockchain { id name }
          }
        }
      }
    }
  }
`;

const TOKEN_BY_ID_QUERY = `
  query TokenById($id: String!) {
    token(id: $id) {
      id
      symbol
      name
      decimals
      totalIssuance
      tokenInstances {
        items {
          centrifugeId
          address
          totalIssuance
          decimals
          createdAtBlock
          blockchain { id name }
        }
      }
    }
  }
`;

const ALL_INSTANCES_PAGE_QUERY = `
  query AllTokenInstances($limit: Int!, $after: String) {
    tokenInstances(
      where: { isActive: true }
      limit: $limit
      orderBy: "tokenId"
      orderDirection: "asc"
      after: $after
    ) {
      items {
        tokenId
        centrifugeId
        address
        decimals
        totalIssuance
        createdAtBlock
        blockchain { id name }
        token { id symbol name decimals }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
      totalCount
    }
  }
`;

const SNAPSHOTS_PAGE_QUERY = `
  query InstanceSnapshots(
    $tokenId: String!
    $centrifugeId: String!
    $limit: Int!
    $orderDirection: String!
    $after: String
  ) {
    tokenInstanceSnapshots(
      where: { tokenId: $tokenId, centrifugeId: $centrifugeId }
      limit: $limit
      orderBy: "blockNumber"
      orderDirection: $orderDirection
      after: $after
    ) {
      items {
        tokenId
        centrifugeId
        totalIssuance
        blockNumber
        timestamp
        trigger
      }
      pageInfo {
        endCursor
        hasNextPage
      }
      totalCount
    }
  }
`;

/**
 * @param {string} graphqlUrl
 * @param {string} tokenId
 * @param {string} centrifugeId
 * @param {{ sinceCreation: boolean; snapshotLimit: number; pageSize: number }} opts
 */
async function fetchSnapshots(graphqlUrl, tokenId, centrifugeId, opts) {
  if (!opts.sinceCreation) {
    const data = await gql(graphqlUrl, SNAPSHOTS_PAGE_QUERY, {
      tokenId,
      centrifugeId,
      limit: opts.snapshotLimit,
      orderDirection: "desc",
      after: null,
    });
    return {
      snapshots: data.tokenInstanceSnapshots?.items ?? [],
      totalCount: data.tokenInstanceSnapshots?.totalCount ?? null,
    };
  }

  /** @type {Array<{ tokenId: string; centrifugeId: string; totalIssuance: string; blockNumber: number; timestamp: string; trigger: string }>} */
  const snapshots = [];
  let after = null;
  let totalCount = null;
  let page = 0;

  while (true) {
    page += 1;
    const data = await gql(graphqlUrl, SNAPSHOTS_PAGE_QUERY, {
      tokenId,
      centrifugeId,
      limit: opts.pageSize,
      orderDirection: "asc",
      after,
    });
    const pageResult = data.tokenInstanceSnapshots;
    const items = pageResult?.items ?? [];
    if (totalCount === null && pageResult?.totalCount != null) {
      totalCount = pageResult.totalCount;
    }
    snapshots.push(...items);
    process.stderr.write(
      `\rFetched ${snapshots.length}${totalCount != null ? `/${totalCount}` : ""} snapshots (page ${page})...`
    );
    if (!pageResult?.pageInfo?.hasNextPage) break;
    after = pageResult.pageInfo.endCursor;
  }
  process.stderr.write("\n");

  return { snapshots, totalCount };
}

/**
 * @param {string} graphqlUrl
 * @param {number} pageSize
 */
async function fetchAllActiveInstances(graphqlUrl, pageSize) {
  /** @type {Array<{ tokenId: string; centrifugeId: string; address: `0x${string}`; decimals: number; totalIssuance: string; createdAtBlock: number | null; blockchain: { id: string; name: string }; token: { id: string; symbol: string; name: string; decimals: number } | null }>} */
  const instances = [];
  let after = null;
  let totalCount = null;
  let page = 0;

  while (true) {
    page += 1;
    const data = await gql(graphqlUrl, ALL_INSTANCES_PAGE_QUERY, {
      limit: pageSize,
      after,
    });
    const pageResult = data.tokenInstances;
    const items = pageResult?.items ?? [];
    if (totalCount === null && pageResult?.totalCount != null) {
      totalCount = pageResult.totalCount;
    }
    instances.push(...items);
    process.stderr.write(
      `\rFetched ${instances.length}${totalCount != null ? `/${totalCount}` : ""} active instance(s) (page ${page})...`
    );
    if (!pageResult?.pageInfo?.hasNextPage) break;
    after = pageResult.pageInfo.endCursor;
  }
  process.stderr.write("\n");

  return { instances, totalCount };
}

/**
 * @param {Array<T>} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} fn
 * @template T, R
 */
async function mapPool(items, concurrency, fn) {
  /** @type {R[]} */
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/**
 * @param {import("viem").PublicClient} client
 * @param {`0x${string}`} address
 * @param {number} decimals
 * @param {bigint} indexed
 * @param {bigint | undefined} blockNumber
 * @param {string} chainName
 * @param {string} kind
 * @param {string} blockLabel
 * @param {bigint} toleranceWei
 */
async function checkRow(
  client,
  address,
  decimals,
  indexed,
  blockNumber,
  chainName,
  kind,
  blockLabel,
  toleranceWei
) {
  const onchain = await readTotalSupplyAtBlock(client, address, blockNumber);
  const diff = diffLine(indexed, onchain, decimals, toleranceWei);
  return {
    chain: chainName,
    kind,
    block: blockLabel,
    blockNumber: blockNumber ?? null,
    indexed: formatAmount(indexed, decimals),
    onchain: formatAmount(onchain, decimals),
    delta: diff.deltaFmt,
    pct: diff.pct,
    ok: diff.match,
    material: diff.material,
    indexedRaw: indexed,
    onchainRaw: onchain,
    deltaRaw: diff.delta,
  };
}

/**
 * @typedef {Object} VerifyOpts
 * @property {string} graphqlUrl
 * @property {boolean} sinceCreation
 * @property {number} snapshotLimit
 * @property {number} pageSize
 * @property {bigint} toleranceWei
 * @property {boolean} latestSnapshotOnly
 * @property {boolean} includeCreationRow
 * @property {string} [symbolLabel]
 */

/**
 * @param {{
 *   tokenId: string;
 *   centrifugeId: string;
 *   address: `0x${string}`;
 *   decimals: number;
 *   totalIssuance: string;
 *   createdAtBlock: number | null;
 *   blockchain: { id: string; name: string };
 * }} instance
 * @param {{ id: string; symbol: string; name: string; decimals: number }} tokenMeta
 * @param {VerifyOpts} opts
 */
async function verifyTokenInstance(instance, tokenMeta, opts) {
  /** @type {Awaited<ReturnType<typeof checkRow>>[]} */
  const rows = [];
  let failures = 0;
  let skipped = false;
  let skipReason = "";

  const chainName = instance.blockchain.name;
  const chainId = Number(instance.blockchain.id);
  const decimals = instance.decimals ?? tokenMeta.decimals;
  const address = instance.address;
  const symbolLabel = opts.symbolLabel ?? tokenMeta.symbol;

  /** @type {import("viem").PublicClient | null} */
  let client = null;
  try {
    client = rpcClientForChain(chainId);
  } catch (err) {
    skipped = true;
    skipReason = err instanceof Error ? err.message : String(err);
    return { rows, failures: 1, skipped, skipReason, symbolLabel, chainName };
  }

  if (!opts.latestSnapshotOnly) {
    const liveIndexed = BigInt(instance.totalIssuance ?? "0");
    const liveRow = await checkRow(
      client,
      address,
      decimals,
      liveIndexed,
      undefined,
      chainName,
      "live",
      "latest",
      opts.toleranceWei
    );
    liveRow.symbol = symbolLabel;
    rows.push(liveRow);
    if (!liveRow.ok) failures += 1;
  }

  if (opts.includeCreationRow && instance.createdAtBlock != null) {
    const onchainAtCreate = await readTotalSupplyAtBlock(
      client,
      address,
      BigInt(instance.createdAtBlock)
    );
    rows.push({
      symbol: symbolLabel,
      chain: chainName,
      kind: "creation",
      block: String(instance.createdAtBlock),
      blockNumber: BigInt(instance.createdAtBlock),
      indexed: "—",
      onchain: formatAmount(onchainAtCreate, decimals),
      delta: "—",
      pct: "—",
      ok: true,
      material: false,
      indexedRaw: 0n,
      onchainRaw: onchainAtCreate,
      deltaRaw: 0n,
    });
  }

  const { snapshots, totalCount } = await fetchSnapshots(
    opts.graphqlUrl,
    tokenMeta.id,
    instance.centrifugeId,
    {
      sinceCreation: opts.sinceCreation,
      snapshotLimit: opts.snapshotLimit,
      pageSize: opts.pageSize,
    }
  );

  if (snapshots.length === 0) {
    rows.push({
      symbol: symbolLabel,
      chain: chainName,
      kind: "snapshot",
      block: "—",
      blockNumber: null,
      indexed: "—",
      onchain: "—",
      delta: "—",
      pct: "—",
      ok: true,
      material: false,
      indexedRaw: 0n,
      onchainRaw: 0n,
      deltaRaw: 0n,
      noSnapshot: true,
    });
    return { rows, failures, skipped: false, skipReason: "", symbolLabel, chainName, totalCount };
  }

  for (const snap of snapshots) {
    const snapIndexed = BigInt(snap.totalIssuance ?? "0");
    const blockNumber = BigInt(snap.blockNumber);
    const snapRow = await checkRow(
      client,
      address,
      decimals,
      snapIndexed,
      blockNumber,
      chainName,
      "snapshot",
      String(snap.blockNumber),
      opts.toleranceWei
    );
    snapRow.symbol = symbolLabel;
    snapRow.trigger = snap.trigger;
    rows.push(snapRow);
    if (!snapRow.ok) failures += 1;
  }

  return { rows, failures, skipped: false, skipReason: "", symbolLabel, chainName, totalCount };
}

/**
 * @param {Awaited<ReturnType<typeof checkRow>>[]} rows
 * @param {boolean} mismatchesOnly
 * @param {boolean} showSymbol
 */
function printResultTable(rows, mismatchesOnly, showSymbol) {
  const printRows = mismatchesOnly
    ? rows.filter((r) => r.kind !== "creation" && !r.noSnapshot && !r.ok && r.material)
    : rows.filter((r) => !r.noSnapshot);

  const col = (s, w) => String(s).padEnd(w);
  const widths = {
    symbol: 10,
    chain: 12,
    kind: 10,
    block: 10,
    indexed: 22,
    onchain: 22,
    delta: 22,
    pct: 10,
    ok: 4,
  };

  if (printRows.length === 0) {
    if (mismatchesOnly) console.log("(no mismatches — all checks matched)\n");
    return;
  }

  const header = [
    ...(showSymbol ? [col("symbol", widths.symbol)] : []),
    col("chain", widths.chain),
    col("kind", widths.kind),
    col("block", widths.block),
    col("indexed", widths.indexed),
    col("onchain", widths.onchain),
    col("delta", widths.delta),
    col("pct%", widths.pct),
    col("ok", widths.ok),
  ].join(" ");
  console.log(header);
  console.log("-".repeat(showSymbol ? 132 : 120));

  for (const r of printRows) {
    console.log(
      [
        ...(showSymbol ? [col(r.symbol ?? "?", widths.symbol)] : []),
        col(r.chain, widths.chain),
        col(r.kind, widths.kind),
        col(r.block, widths.block),
        col(r.indexed, widths.indexed),
        col(r.onchain, widths.onchain),
        col(r.delta, widths.delta),
        col(r.pct, widths.pct),
        col(r.ok ? "yes" : "NO", widths.ok),
      ].join(" ")
    );
  }
  console.log("");
}

/**
 * @param {Array<{ tokenId: string; centrifugeId: string; address: `0x${string}`; decimals: number; totalIssuance: string; createdAtBlock: number | null; blockchain: { id: string; name: string }; token: { id: string; symbol: string; name: string; decimals: number } | null }>} instances
 * @param {string | undefined} chainFilter
 * @param {VerifyOpts & { concurrency: number; mismatchesOnly: boolean }} opts
 */
async function runAllInstances(instances, chainFilter, opts) {
  let filtered = instances;
  if (chainFilter) {
    filtered = instances.filter((i) => i.blockchain.name.toLowerCase() === chainFilter);
    if (filtered.length === 0) {
      console.error(`No active token instances on chain "${chainFilter}"`);
      process.exit(1);
    }
  }

  console.log(`GraphQL: ${opts.graphqlUrl}`);
  console.log(
    `Mode: all active instances — ${opts.sinceCreation ? "all snapshots since creation" : `latest ${opts.snapshotLimit} snapshot(s)`}${opts.latestSnapshotOnly ? "" : " + live"}`
  );
  console.log(`Instances: ${filtered.length}${chainFilter ? ` on ${chainFilter}` : ""}`);
  console.log(`Concurrency: ${opts.concurrency}`);
  console.log("");

  /** @type {Awaited<ReturnType<typeof checkRow>>[]} */
  const rows = [];
  let failures = 0;
  let skippedRpc = 0;
  let noSnapshot = 0;
  let done = 0;

  const results = await mapPool(filtered, opts.concurrency, async (instance) => {
    const tokenMeta = instance.token ?? {
      id: instance.tokenId,
      symbol: instance.tokenId.slice(0, 10),
      name: instance.tokenId,
      decimals: instance.decimals,
    };
    const result = await verifyTokenInstance(instance, tokenMeta, {
      ...opts,
      symbolLabel: tokenMeta.symbol,
      includeCreationRow: false,
    });
    done += 1;
    if (done % 10 === 0 || done === filtered.length) {
      process.stderr.write(`\rVerified ${done}/${filtered.length} instance(s)...`);
    }
    return result;
  });
  process.stderr.write(`\rVerified ${filtered.length}/${filtered.length} instance(s) — done\n`);

  for (const result of results) {
    if (result.skipped) {
      skippedRpc += 1;
      console.error(`[${result.symbolLabel}@${result.chainName}] skip — ${result.skipReason}`);
      failures += result.failures;
      continue;
    }
    const snapRows = result.rows.filter((r) => r.kind === "snapshot");
    if (snapRows.length === 1 && snapRows[0]?.noSnapshot) noSnapshot += 1;
    rows.push(...result.rows);
    failures += result.failures;
  }

  printResultTable(rows, opts.mismatchesOnly, true);

  const liveRows = rows.filter((r) => r.kind === "live");
  const snapRows = rows.filter((r) => r.kind === "snapshot" && !r.noSnapshot);
  const materialFailures = rows.filter(
    (r) => (r.kind === "live" || r.kind === "snapshot") && !r.ok && r.material
  );

  console.log("Summary (all instances):");
  console.log(`  instances checked: ${filtered.length}`);
  if (!opts.latestSnapshotOnly) {
    console.log(
      `  live: ${liveRows.filter((r) => r.ok).length} match, ${liveRows.filter((r) => !r.ok && r.material).length} material mismatch`
    );
  }
  console.log(
    `  snapshots: ${snapRows.filter((r) => r.ok).length} match, ${snapRows.filter((r) => !r.ok && r.material).length} material mismatch`
  );
  if (noSnapshot > 0) console.log(`  no period snapshot yet: ${noSnapshot}`);
  if (skippedRpc > 0) console.log(`  skipped (no RPC): ${skippedRpc}`);
  console.log("");

  exitWithStatus(rows, failures, opts.toleranceWei);
}

/**
 * @param {Awaited<ReturnType<typeof checkRow>>[]} rows
 * @param {number} failures
 * @param {bigint} toleranceWei
 */
function exitWithStatus(rows, failures, toleranceWei) {
  const checkedCount = rows.filter(
    (r) => (r.kind === "live" || r.kind === "snapshot") && !r.noSnapshot
  ).length;
  const materialFailures = rows.filter(
    (r) => (r.kind === "live" || r.kind === "snapshot") && !r.ok && r.material
  ).length;
  if (materialFailures === 0 && failures === 0) {
    console.log(`OK — all ${checkedCount} issuance checks matched on-chain totalSupply`);
    process.exit(0);
  }
  if (materialFailures === 0 && failures > 0) {
    console.log(
      `OK — ${checkedCount} checks within tolerance (${toleranceWei} wei); ${failures} dust-only drift row(s)`
    );
    process.exit(0);
  }
  console.error(
    `FAIL — ${materialFailures} material mismatch(es) of ${checkedCount} issuance checks vs on-chain totalSupply`
  );
  process.exit(1);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    usage();
    process.exit(0);
  }
  if (argv.length === 0) {
    usage();
    process.exit(1);
  }

  const symbol = readFlag("--symbol", argv);
  const tokenId = readFlag("--token-id", argv);
  const allInstances = hasFlag("--all-instances", argv);
  const chainFilter = readFlag("--chain", argv)?.toLowerCase();
  const graphqlUrl = resolveGraphqlUrl(argv);
  const sinceCreation = hasFlag("--since-creation", argv);
  const withLive = hasFlag("--with-live", argv);
  const latestSnapshotOnly = allInstances
    ? !withLive
    : hasFlag("--latest-snapshot-only", argv);
  const mismatchesOnly = hasFlag("--mismatches-only", argv);
  const toleranceWei = BigInt(readFlag("--tolerance", argv) ?? "1");
  const defaultSnapshots = allInstances ? 1 : 5;
  const snapshotLimit = Number(readFlag("--snapshots", argv) ?? String(defaultSnapshots));
  const pageSize = Number(readFlag("--page-size", argv) ?? String(DEFAULT_PAGE_SIZE));
  const concurrency = Number(readFlag("--concurrency", argv) ?? "5");

  if (allInstances && (symbol || tokenId)) {
    console.error("Use either --all-instances or --symbol/--token-id, not both");
    process.exit(1);
  }
  if (!allInstances && !symbol && !tokenId) {
    console.error("Provide --symbol, --token-id, or --all-instances");
    usage();
    process.exit(1);
  }
  if (!sinceCreation && (Number.isNaN(snapshotLimit) || snapshotLimit < 1)) {
    console.error("--snapshots must be a positive integer");
    process.exit(1);
  }
  if (Number.isNaN(pageSize) || pageSize < 1) {
    console.error("--page-size must be a positive integer");
    process.exit(1);
  }
  if (Number.isNaN(concurrency) || concurrency < 1) {
    console.error("--concurrency must be a positive integer");
    process.exit(1);
  }

  const verifyOpts = {
    graphqlUrl,
    sinceCreation,
    snapshotLimit,
    pageSize,
    toleranceWei,
    latestSnapshotOnly,
    includeCreationRow: true,
  };

  if (allInstances) {
    const { instances } = await fetchAllActiveInstances(graphqlUrl, pageSize);
    await runAllInstances(instances, chainFilter, {
      ...verifyOpts,
      concurrency,
      mismatchesOnly,
    });
    return;
  }

  /** @type {{ id: string; symbol: string; name: string; decimals: number; totalIssuance: string; tokenInstances: { items: Array<{ centrifugeId: string; address: `0x${string}`; totalIssuance: string; decimals: number; createdAtBlock: number | null; blockchain: { id: string; name: string } }> } } | null} */
  let token;
  if (symbol) {
    const data = await gql(graphqlUrl, TOKEN_BY_SYMBOL_QUERY, { symbol });
    token = data.tokens?.items?.[0] ?? null;
  } else {
    const data = await gql(graphqlUrl, TOKEN_BY_ID_QUERY, { id: tokenId });
    token = data.token;
  }

  if (!token) {
    console.error(`Token not found (${symbol ?? tokenId})`);
    process.exit(1);
  }

  let instances = token.tokenInstances.items;
  if (chainFilter) {
    instances = instances.filter((i) => i.blockchain.name.toLowerCase() === chainFilter);
    if (instances.length === 0) {
      console.error(`No token instance on chain "${chainFilter}" for ${token.symbol}`);
      process.exit(1);
    }
  }

  console.log(`Token: ${token.symbol} (${token.name})`);
  console.log(`tokenId: ${token.id}`);
  console.log(`GraphQL: ${graphqlUrl}`);
  console.log(
    `Mode: ${sinceCreation ? "all period snapshots since creation (asc)" : `latest ${snapshotLimit} snapshot(s)`}${latestSnapshotOnly ? " (no live check)" : " + live"}`
  );
  console.log(`Instances: ${instances.length}`);
  console.log("");

  /** @type {Awaited<ReturnType<typeof checkRow>>[]} */
  const rows = [];
  let failures = 0;

  for (const instance of instances) {
    const chainName = instance.blockchain.name;
    console.error(
      `[${chainName}] checking ${latestSnapshotOnly ? "" : "live + "}${sinceCreation ? "all" : snapshotLimit} snapshot(s)...`
    );

    const result = await verifyTokenInstance(
      instance,
      { id: token.id, symbol: token.symbol, name: token.name, decimals: token.decimals },
      { ...verifyOpts, latestSnapshotOnly, symbolLabel: token.symbol }
    );

    if (result.skipped) {
      console.error(`[${chainName}] skip — ${result.skipReason}`);
      failures += result.failures;
      continue;
    }

    rows.push(...result.rows);
    failures += result.failures;
  }

  printResultTable(rows, mismatchesOnly, false);

  for (const chainName of [...new Set(instances.map((i) => i.blockchain.name))]) {
    const instance = instances.find((i) => i.blockchain.name === chainName);
    const decimals = instance?.decimals ?? token.decimals;
    const chainRows = rows.filter((r) => r.chain === chainName && r.kind === "snapshot" && !r.noSnapshot);
    if (chainRows.length === 0) continue;

    const first = chainRows[0];
    const last = chainRows[chainRows.length - 1];
    const firstMismatch = chainRows.find((r) => !r.ok);
    const firstMaterial = chainRows.find((r) => !r.ok && r.material);
    const firstMajor = chainRows.find((r) => {
      if (r.ok) return false;
      const abs = r.deltaRaw < 0n ? -r.deltaRaw : r.deltaRaw;
      return abs > 10n ** BigInt(decimals);
    });
    const materialCount = chainRows.filter((r) => !r.ok && r.material).length;

    console.log(`Summary [${chainName}]:`);
    console.log(`  snapshots checked: ${chainRows.length}`);
    console.log(
      `  first snapshot block ${first.block}: ${first.ok ? "match" : "MISMATCH"} (indexed ${first.indexed}, on-chain ${first.onchain})`
    );
    console.log(
      `  latest snapshot block ${last.block}: ${last.ok ? "match" : "MISMATCH"} (indexed ${last.indexed}, on-chain ${last.onchain})`
    );
    if (firstMajor) {
      console.log(
        `  first major divergence (>=1 token) at block ${firstMajor.block}: indexed ${firstMajor.indexed}, on-chain ${firstMajor.onchain}, delta ${firstMajor.delta} (${firstMajor.pct}%)`
      );
      const majorCount = chainRows.filter((r) => {
        if (r.ok) return false;
        const abs = r.deltaRaw < 0n ? -r.deltaRaw : r.deltaRaw;
        return abs > 10n ** BigInt(decimals);
      }).length;
      console.log(`  major mismatches: ${majorCount}/${chainRows.length}`);
    } else if (firstMaterial) {
      console.log(
        `  first material divergence at block ${firstMaterial.block}: indexed ${firstMaterial.indexed}, on-chain ${firstMaterial.onchain}, delta ${firstMaterial.delta} (${firstMaterial.pct}%)`
      );
      console.log(`  material mismatches: ${materialCount}/${chainRows.length}`);
    } else if (firstMismatch) {
      console.log(
        `  dust-only drift (<= ${toleranceWei} wei tolerance): first at block ${firstMismatch.block}, delta ${firstMismatch.delta}`
      );
    } else {
      console.log(`  all period snapshots matched on-chain totalSupply at snapshot block`);
    }
    console.log("");
  }

  exitWithStatus(rows, failures, toleranceWei);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
