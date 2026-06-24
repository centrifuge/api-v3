#!/usr/bin/env node
/**
 * Aggregate share-class TVL by blockchain from the indexer GraphQL API.
 *
 * TVL per token instance matches `/stats` (`TokenService.getNormalisedTvl`):
 *   (totalIssuance * tokenPrice) / 10^decimals  → 18-decimal fixed-point pool currency.
 *
 * Usage:
 *   node scripts/tvl-by-blockchain.mjs
 *   node scripts/tvl-by-blockchain.mjs --graphql https://api-v3-main-s.cfg.embrio.tech/
 *   node scripts/tvl-by-blockchain.mjs --metric holdings
 *   node scripts/tvl-by-blockchain.mjs --json
 *
 * GraphQL: `--graphql <URL>` or `GRAPHQL_URL` in `.env.local` (default: https://api.centrifuge.io/).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

const DEFAULT_GRAPHQL = "https://api.centrifuge.io/";
const DEFAULT_PAGE_SIZE = 100;

const TOKEN_INSTANCES_PAGE_QUERY = `
  query TokenInstancesForTvl($limit: Int!, $after: String) {
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
        totalIssuance
        tokenPrice
        decimals
        blockchain {
          id
          name
          network
          chainId
        }
        token {
          symbol
          tokenPrice
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
      totalCount
    }
  }
`;

const HOLDINGS_PAGE_QUERY = `
  query HoldingsForTvl($limit: Int!, $after: String) {
    holdings(
      limit: $limit
      orderBy: "tokenId"
      orderDirection: "asc"
      after: $after
    ) {
      items {
        centrifugeId
        totalValue
        isLiability
        isInitialized
        blockchain {
          id
          name
          network
          chainId
        }
        token {
          symbol
        }
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
 * @param {string} argv
 */
function resolveGraphqlUrl(argv) {
  const fromFlag = readFlag("--graphql", argv);
  if (fromFlag) return fromFlag;
  const fromEnv = process.env.GRAPHQL_URL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_GRAPHQL;
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
 * @param {number} [decimals]
 */
function formatFixed18(value, decimals = 18) {
  if (value < 0n) throw new Error("negative value");
  const divisor = 10n ** BigInt(decimals);
  const integerPart = value / divisor;
  const remainder = value % divisor;
  const remainderStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return remainderStr.length > 0 ? `${integerPart}.${remainderStr}` : integerPart.toString();
}

/**
 * @param {string | null | undefined} raw
 */
function parseBigInt(raw) {
  if (raw == null || raw === "") return 0n;
  return BigInt(raw);
}

/**
 * Share-class TVL for one instance (18-dec pool currency).
 *
 * @param {{ totalIssuance: string; tokenPrice: string | null; decimals: number; token: { tokenPrice: string | null } | null }} row
 */
function instanceShareTvlWei(row) {
  const issuance = parseBigInt(row.totalIssuance);
  if (issuance === 0n) return 0n;
  const price = parseBigInt(row.tokenPrice ?? row.token?.tokenPrice);
  if (price === 0n) return 0n;
  return (issuance * price) / 10n ** BigInt(row.decimals);
}

/**
 * @param {string} graphqlUrl
 * @param {string} query
 * @param {string} rootField
 * @param {number} pageSize
 */
async function paginate(graphqlUrl, query, rootField, pageSize) {
  /** @type {unknown[]} */
  const items = [];
  let after = null;
  let page = 0;

  while (true) {
    page += 1;
    const data = await gql(graphqlUrl, query, { limit: pageSize, after });
    const pageResult = data[rootField];
    const batch = pageResult?.items ?? [];
    items.push(...batch);
    process.stderr.write(`\rFetched ${items.length} ${rootField} row(s) (page ${page})...`);
    if (!pageResult?.pageInfo?.hasNextPage) break;
    after = pageResult.pageInfo.endCursor;
  }
  process.stderr.write("\n");
  return items;
}

/**
 * @param {string} graphqlUrl
 * @param {number} pageSize
 */
async function loadShareTvlByBlockchain(graphqlUrl, pageSize) {
  const rows = await paginate(graphqlUrl, TOKEN_INSTANCES_PAGE_QUERY, "tokenInstances", pageSize);
  /** @type {Map<string, { centrifugeId: string; name: string; network: string; chainId: number | null; tvlWei: bigint; instanceCount: number; skippedNoPrice: number }>} */
  const byChain = new Map();

  for (const row of rows) {
    const chain = row.blockchain;
    const centrifugeId = row.centrifugeId;
    if (!centrifugeId) continue;
    const key = centrifugeId;
    let bucket = byChain.get(key);
    if (!bucket) {
      bucket = {
        centrifugeId,
        name: chain?.name ?? chain?.network ?? centrifugeId,
        network: chain?.network ?? chain?.name ?? centrifugeId,
        chainId: chain?.chainId ?? null,
        tvlWei: 0n,
        instanceCount: 0,
        skippedNoPrice: 0,
      };
      byChain.set(key, bucket);
    }

    bucket.instanceCount += 1;
    const tvl = instanceShareTvlWei(row);
    if (tvl === 0n && parseBigInt(row.totalIssuance) > 0n) {
      bucket.skippedNoPrice += 1;
    }
    bucket.tvlWei += tvl;
  }

  return [...byChain.values()].sort((a, b) => (a.tvlWei < b.tvlWei ? 1 : a.tvlWei > b.tvlWei ? -1 : 0));
}

/**
 * @param {string} graphqlUrl
 * @param {number} pageSize
 */
async function loadHoldingsTvlByBlockchain(graphqlUrl, pageSize) {
  const rows = await paginate(graphqlUrl, HOLDINGS_PAGE_QUERY, "holdings", pageSize);
  /** @type {Map<string, { centrifugeId: string; name: string; network: string; chainId: number | null; tvlWei: bigint; holdingCount: number }>} */
  const byChain = new Map();

  for (const row of rows) {
    const chain = row.blockchain;
    const centrifugeId = row.centrifugeId;
    if (!centrifugeId) continue;
    const key = centrifugeId;
    let bucket = byChain.get(key);
    if (!bucket) {
      bucket = {
        centrifugeId,
        name: chain?.name ?? chain?.network ?? centrifugeId,
        network: chain?.network ?? chain?.name ?? centrifugeId,
        chainId: chain?.chainId ?? null,
        tvlWei: 0n,
        holdingCount: 0,
      };
      byChain.set(key, bucket);
    }

    if (!row.isInitialized) continue;
    bucket.holdingCount += 1;
    const value = parseBigInt(row.totalValue);
    if (row.isLiability) {
      bucket.tvlWei -= value;
    } else {
      bucket.tvlWei += value;
    }
  }

  return [...byChain.values()].sort((a, b) => (a.tvlWei < b.tvlWei ? 1 : a.tvlWei > b.tvlWei ? -1 : 0));
}

function usage() {
  console.error(`Usage: tvl-by-blockchain.mjs [options]

Options:
  --metric <shares|holdings>  TVL basis: share issuance (default) or hub holding totalValue
  --graphql <URL>             GraphQL endpoint (or GRAPHQL_URL in .env.local)
  --page-size <N>             Pagination size (default: ${DEFAULT_PAGE_SIZE})
  --json                      Print JSON instead of a table
  --help                      Show this help

GraphQL ad-hoc (shares metric — aggregate client-side):

  query TvlByChainInstances {
    tokenInstances(where: { isActive: true }, limit: 1000) {
      items {
        centrifugeId
        totalIssuance
        tokenPrice
        decimals
        blockchain { name network chainId }
        token { symbol tokenPrice }
      }
    }
  }
`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (hasFlag("--help", argv)) {
    usage();
    process.exit(0);
  }

  const graphqlUrl = resolveGraphqlUrl(argv);
  const metric = readFlag("--metric", argv) ?? "shares";
  const pageSize = Number(readFlag("--page-size", argv) ?? DEFAULT_PAGE_SIZE);
  const asJson = hasFlag("--json", argv);

  if (!Number.isFinite(pageSize) || pageSize < 1) {
    throw new Error("--page-size must be a positive integer");
  }
  if (metric !== "shares" && metric !== "holdings") {
    throw new Error('--metric must be "shares" or "holdings"');
  }

  const rows =
    metric === "holdings"
      ? await loadHoldingsTvlByBlockchain(graphqlUrl, pageSize)
      : await loadShareTvlByBlockchain(graphqlUrl, pageSize);

  const totalWei = rows.reduce((acc, row) => acc + row.tvlWei, 0n);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          graphqlUrl,
          metric,
          totalTvl: formatFixed18(totalWei),
          totalTvlWei: totalWei.toString(),
          blockchains: rows.map((row) => ({
            ...row,
            tvl: formatFixed18(row.tvlWei),
            tvlWei: row.tvlWei.toString(),
          })),
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`GraphQL: ${graphqlUrl}`);
  console.log(`Metric: ${metric} (18-decimal pool currency)`);
  console.log(`Total TVL: ${formatFixed18(totalWei)}`);
  console.log("");
  console.log(
    [
      "chain".padEnd(14),
      "chainId".padStart(8),
      "centrifugeId".padStart(14),
      "tvl".padStart(28),
      metric === "shares" ? "instances".padStart(10) : "holdings".padStart(10),
    ].join(" ")
  );
  console.log("-".repeat(80));

  for (const row of rows) {
    const count =
      metric === "shares"
        ? String(row.instanceCount ?? 0)
        : String(row.holdingCount ?? 0);
    console.log(
      [
        row.name.padEnd(14),
        String(row.chainId ?? "").padStart(8),
        row.centrifugeId.padStart(14),
        formatFixed18(row.tvlWei).padStart(28),
        count.padStart(10),
      ].join(" ")
    );
  }

  if (metric === "shares") {
    const skipped = rows.reduce((acc, row) => acc + (row.skippedNoPrice ?? 0), 0);
    if (skipped > 0) {
      console.log("");
      console.log(
        `Note: ${skipped} active instance(s) with issuance > 0 but no price were excluded from TVL.`
      );
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
