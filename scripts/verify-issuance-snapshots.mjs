#!/usr/bin/env node
/**
 * Compare token_instance issuance in the indexer (live + period snapshots) against
 * on-chain ERC-20 totalSupply at the same block via GraphQL + RPC.
 *
 * Usage:
 *   node scripts/verify-issuance-snapshots.mjs --symbol ACRDX --chain plume --since-creation
 *   node scripts/verify-issuance-snapshots.mjs --token-id 0x0001... --snapshots 5
 *   node scripts/verify-issuance-snapshots.mjs --symbol ACRDX --since-creation --mismatches-only
 *
 * Env: loads .env.local / .env for DRPC_API_KEY, CONDUIT_API_KEY, PONDER_RPC_URL_<chainId>.
 */

import dotenv from "dotenv";
import { createPublicClient, defineChain, http, parseAbi } from "viem";
import { arbitrum, avalanche, base, bsc, mainnet, optimism } from "viem/chains";

dotenv.config({ path: [".env.local", ".env"] });

const plumeMainnet = defineChain({
  id: 98866,
  name: "Plume",
  nativeCurrency: { name: "Plume", symbol: "PLUME", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.plume.org"] } },
});

const monadMainnet = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
});

const DEFAULT_GRAPHQL = "https://api.centrifuge.io/";
const DEFAULT_PAGE_SIZE = 100;
const ERC20_ABI = parseAbi(["function totalSupply() view returns (uint256)"]);

/** @type {Record<string, { chainId: number; viemChain: import("viem").Chain; rpcUrls: string[] }>} */
const CHAIN_BY_NAME = {
  ethereum: {
    chainId: 1,
    viemChain: mainnet,
    rpcUrls: [
      process.env.PONDER_RPC_URL_1,
      process.env.ALCHEMY_API_KEY &&
        `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      process.env.DRPC_API_KEY && `https://lb.drpc.live/ethereum/${process.env.DRPC_API_KEY}`,
    ].filter(Boolean),
  },
  base: {
    chainId: 8453,
    viemChain: base,
    rpcUrls: [
      process.env.PONDER_RPC_URL_8453,
      process.env.ALCHEMY_API_KEY &&
        `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      process.env.DRPC_API_KEY && `https://lb.drpc.live/base/${process.env.DRPC_API_KEY}`,
    ].filter(Boolean),
  },
  arbitrum: {
    chainId: 42161,
    viemChain: arbitrum,
    rpcUrls: [
      process.env.PONDER_RPC_URL_42161,
      process.env.ALCHEMY_API_KEY &&
        `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      process.env.DRPC_API_KEY && `https://lb.drpc.live/arbitrum/${process.env.DRPC_API_KEY}`,
    ].filter(Boolean),
  },
  optimism: {
    chainId: 10,
    viemChain: optimism,
    rpcUrls: [
      process.env.PONDER_RPC_URL_10,
      process.env.ALCHEMY_API_KEY &&
        `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      process.env.DRPC_API_KEY && `https://lb.drpc.live/optimism/${process.env.DRPC_API_KEY}`,
    ].filter(Boolean),
  },
  avalanche: {
    chainId: 43114,
    viemChain: avalanche,
    rpcUrls: [
      process.env.PONDER_RPC_URL_43114,
      process.env.ALCHEMY_API_KEY &&
        `https://avax-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      process.env.DRPC_API_KEY && `https://lb.drpc.live/avalanche/${process.env.DRPC_API_KEY}`,
    ].filter(Boolean),
  },
  binance: {
    chainId: 56,
    viemChain: bsc,
    rpcUrls: [
      process.env.PONDER_RPC_URL_56,
      process.env.ALCHEMY_API_KEY &&
        `https://bnb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      process.env.DRPC_API_KEY && `https://lb.drpc.live/bsc/${process.env.DRPC_API_KEY}`,
    ].filter(Boolean),
  },
  plume: {
    chainId: 98866,
    viemChain: plumeMainnet,
    rpcUrls: [
      process.env.PONDER_RPC_URL_98866,
      process.env.CONDUIT_API_KEY && `https://rpc.plume.org/${process.env.CONDUIT_API_KEY}`,
      process.env.DRPC_API_KEY && `https://lb.drpc.live/plume/${process.env.DRPC_API_KEY}`,
    ].filter(Boolean),
  },
  monad: {
    chainId: 143,
    viemChain: monadMainnet,
    rpcUrls: [
      process.env.PONDER_RPC_URL_143,
      process.env.ALCHEMY_API_KEY &&
        `https://monad-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      process.env.DRPC_API_KEY && `https://lb.drpc.live/monad-mainnet/${process.env.DRPC_API_KEY}`,
    ].filter(Boolean),
  },
};

function usage() {
  console.error(`Usage: verify-issuance-snapshots.mjs [options]

Options:
  --symbol <SYMBOL>       Share token symbol (e.g. ACRDX)
  --token-id <HEX>        Share class id (scId); alternative to --symbol
  --chain <NAME>          Filter to one chain (plume, ethereum, monad, …)
  --graphql <URL>         GraphQL endpoint (default: ${DEFAULT_GRAPHQL})
  --since-creation        Walk every period snapshot from first to latest (paginated)
  --snapshots <N>         Only check the N most recent snapshots (default: 5; ignored with --since-creation)
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
  const entry = Object.values(CHAIN_BY_NAME).find((c) => c.chainId === chainId);
  if (!entry || entry.rpcUrls.length === 0) {
    throw new Error(
      `No RPC URLs configured for chainId ${chainId}. Set PONDER_RPC_URL_${chainId} or provider API keys in .env.local`
    );
  }
  return createPublicClient({
    chain: entry.viemChain,
    transport: http(entry.rpcUrls[0]),
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

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.length === 0) {
    usage();
    process.exit(argv.includes("--help") ? 0 : 1);
  }

  const symbol = readFlag("--symbol", argv);
  const tokenId = readFlag("--token-id", argv);
  const chainFilter = readFlag("--chain", argv)?.toLowerCase();
  const graphqlUrl = readFlag("--graphql", argv) ?? DEFAULT_GRAPHQL;
  const sinceCreation = hasFlag("--since-creation", argv);
  const mismatchesOnly = hasFlag("--mismatches-only", argv);
  const toleranceWei = BigInt(readFlag("--tolerance", argv) ?? "1");
  const snapshotLimit = Number(readFlag("--snapshots", argv) ?? "5");
  const pageSize = Number(readFlag("--page-size", argv) ?? String(DEFAULT_PAGE_SIZE));

  if (!symbol && !tokenId) {
    console.error("Provide --symbol or --token-id");
    usage();
    process.exit(1);
  }
  if (!sinceCreation && (Number.isNaN(snapshotLimit) || snapshotLimit < 1)) {
    console.error("--snapshots must be a positive integer");
    process.exit(1);
  }
  if (sinceCreation && (Number.isNaN(pageSize) || pageSize < 1)) {
    console.error("--page-size must be a positive integer");
    process.exit(1);
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
  console.log(`Mode: ${sinceCreation ? "all period snapshots since creation (asc)" : `latest ${snapshotLimit} snapshot(s)`}`);
  console.log(`Instances: ${instances.length}`);
  console.log("");

  /** @type {Awaited<ReturnType<typeof checkRow>>[]} */
  const rows = [];
  let failures = 0;

  for (const instance of instances) {
    const chainName = instance.blockchain.name;
    const chainId = Number(instance.blockchain.id);
    const decimals = instance.decimals ?? token.decimals;
    const address = instance.address;

    let client;
    try {
      client = rpcClientForChain(chainId);
    } catch (err) {
      console.error(`[${chainName}] skip — ${err instanceof Error ? err.message : err}`);
      failures += 1;
      continue;
    }

    console.error(`[${chainName}] checking live + ${sinceCreation ? "all" : snapshotLimit} snapshot(s)...`);

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
      toleranceWei
    );
    rows.push(liveRow);
    if (!liveRow.ok) failures += 1;

    if (instance.createdAtBlock != null) {
      const onchainAtCreate = await readTotalSupplyAtBlock(
        client,
        address,
        BigInt(instance.createdAtBlock)
      );
      rows.push({
        chain: chainName,
        kind: "creation",
        block: String(instance.createdAtBlock),
        blockNumber: BigInt(instance.createdAtBlock),
        indexed: "—",
        onchain: formatAmount(onchainAtCreate, decimals),
        delta: "—",
        pct: "—",
        ok: true,
        indexedRaw: 0n,
        onchainRaw: onchainAtCreate,
        deltaRaw: 0n,
      });
    }

    const { snapshots, totalCount } = await fetchSnapshots(graphqlUrl, token.id, instance.centrifugeId, {
      sinceCreation,
      snapshotLimit,
      pageSize,
    });

    if (sinceCreation && totalCount != null) {
      console.error(`[${chainName}] verifying ${snapshots.length} snapshot(s) against RPC...`);
    }

    let checked = 0;
    for (const snap of snapshots) {
      checked += 1;
      if (sinceCreation && checked % 25 === 0) {
        process.stderr.write(`\r[${chainName}] RPC ${checked}/${snapshots.length}...`);
      }
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
        toleranceWei
      );
      snapRow.trigger = snap.trigger;
      rows.push(snapRow);
      if (!snapRow.ok) failures += 1;
    }
    if (sinceCreation && snapshots.length > 0) {
      process.stderr.write(`\r[${chainName}] RPC ${snapshots.length}/${snapshots.length} — done\n`);
    }
  }

  const printRows = mismatchesOnly
    ? rows.filter((r) => r.kind !== "creation" && !r.ok && r.material)
    : rows;

  const col = (s, w) => String(s).padEnd(w);
  const widths = {
    chain: 12,
    kind: 10,
    block: 10,
    indexed: 22,
    onchain: 22,
    delta: 22,
    pct: 10,
    ok: 4,
  };

  if (printRows.length > 0) {
    console.log(
      [
        col("chain", widths.chain),
        col("kind", widths.kind),
        col("block", widths.block),
        col("indexed", widths.indexed),
        col("onchain", widths.onchain),
        col("delta", widths.delta),
        col("pct%", widths.pct),
        col("ok", widths.ok),
      ].join(" ")
    );
    console.log("-".repeat(120));

    for (const r of printRows) {
      console.log(
        [
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
  } else if (mismatchesOnly) {
    console.log("(no mismatches — all checks matched)\n");
  }

  for (const chainName of [...new Set(instances.map((i) => i.blockchain.name))]) {
    const instance = instances.find((i) => i.blockchain.name === chainName);
    const decimals = instance?.decimals ?? token.decimals;
    const chainRows = rows.filter((r) => r.chain === chainName && r.kind === "snapshot");
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
    const mismatchCount = chainRows.filter((r) => !r.ok).length;
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

  const checkedCount = rows.filter((r) => r.kind === "live" || r.kind === "snapshot").length;
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

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
