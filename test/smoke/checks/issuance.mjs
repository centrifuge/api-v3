import { parseAbi } from "viem";
import { diffBigInt } from "../lib/diff.mjs";
import { mapPool, tryReadContract } from "../lib/helpers.mjs";
import { passesChainFilter, resolveEntityChain } from "../lib/context.mjs";

const ERC20_ABI = parseAbi(["function totalSupply() view returns (uint256)"]);

const ALL_INSTANCES_QUERY = `
  query AllTokenInstances($limit: Int!, $after: String) {
    tokenInstances(
      where: { isActive: true }
      limit: $limit
      after: $after
      orderBy: "tokenId"
      orderDirection: "asc"
    ) {
      items {
        tokenId centrifugeId address decimals totalIssuance isActive crosschainInProgress createdAtBlock
        blockchain { id name }
        token { id symbol poolId decimals }
      }
      pageInfo { endCursor hasNextPage }
      totalCount
    }
  }
`;

const TOKEN_BY_SYMBOL = `
  query TokenBySymbol($symbol: String!) {
    tokens(where: { symbol: $symbol }, limit: 1) {
      items {
        id symbol decimals
        tokenInstances {
          items {
            centrifugeId address decimals totalIssuance crosschainInProgress createdAtBlock
            blockchain { id name }
          }
        }
      }
    }
  }
`;

const TOKEN_BY_ID = `
  query TokenById($id: String!) {
    token(id: $id) {
      id symbol decimals
      tokenInstances {
        items {
          centrifugeId address decimals totalIssuance crosschainInProgress createdAtBlock
          blockchain { id name }
        }
      }
    }
  }
`;

const SNAPSHOTS_PAGE_QUERY = `
  query TokenInstanceSnapshots(
    $tokenId: String!
    $centrifugeId: String!
    $limit: Int!
    $after: String
    $orderDirection: String
  ) {
    tokenInstanceSnapshots(
      where: { tokenId: $tokenId, centrifugeId: $centrifugeId }
      limit: $limit
      after: $after
      orderBy: "blockNumber"
      orderDirection: $orderDirection
    ) {
      items { blockNumber totalIssuance trigger }
      pageInfo { endCursor hasNextPage }
      totalCount
    }
  }
`;

/**
 * @param {import('../lib/context.mjs').SmokeContext} ctx
 * @param {string} tokenId
 * @param {string} centrifugeId
 */
async function fetchSnapshots(ctx, tokenId, centrifugeId) {
  const sinceCreation = Boolean(ctx.smokeOptions.sinceCreation);
  const snapshotLimit = Number(ctx.smokeOptions.snapshots ?? 5);

  if (!sinceCreation) {
    const data = await ctx.gql(SNAPSHOTS_PAGE_QUERY, {
      tokenId,
      centrifugeId,
      limit: snapshotLimit,
      orderDirection: "desc",
      after: null,
    });
    return data.tokenInstanceSnapshots?.items ?? [];
  }

  /** @type {Array<{ blockNumber: number; totalIssuance: string; trigger: string }>} */
  const snapshots = [];
  let after = null;
  while (true) {
    const data = await ctx.gql(SNAPSHOTS_PAGE_QUERY, {
      tokenId,
      centrifugeId,
      limit: ctx.pageSize,
      orderDirection: "asc",
      after,
    });
    const pageResult = data.tokenInstanceSnapshots;
    snapshots.push(...(pageResult?.items ?? []));
    if (!pageResult?.pageInfo?.hasNextPage) break;
    after = pageResult.pageInfo.endCursor;
  }
  return snapshots;
}

/**
 * @param {import('../lib/context.mjs').SmokeContext} ctx
 * @param {import('viem').PublicClient} client
 * @param {`0x${string}`} address
 * @param {bigint} indexed
 * @param {bigint | undefined} blockNumber
 * @param {string} entityId
 * @returns {Promise<{ skipped?: boolean; mismatch?: object }>}
 */
async function checkSupply(ctx, client, address, indexed, blockNumber, entityId) {
  const atBlock = blockNumber ?? ctx.atBlock;
  let code;
  try {
    code = await client.getBytecode({ address, blockNumber: atBlock });
  } catch {
    return { skipped: true };
  }
  if (!code || code === "0x") {
    return { skipped: true };
  }

  const supplyResult = await tryReadContract(() =>
    client.readContract({
      address,
      abi: ERC20_ABI,
      functionName: "totalSupply",
      blockNumber: atBlock,
    })
  );

  if (!supplyResult.ok) {
    if (supplyResult.revert) return { skipped: true };
    return { skipped: true };
  }

  const onchain = supplyResult.value;
  const diff = diffBigInt(indexed, onchain, ctx.tolerance);
  if (!diff.match) {
    return {
      mismatch: ctx.mismatch({
        entityId,
        field: "totalIssuance",
        indexed: indexed.toString(),
        onchain: onchain.toString(),
        note: blockNumber != null ? `block=${blockNumber}` : "live",
      }),
    };
  }
  return {};
}

/**
 * @param {import('../lib/context.mjs').SmokeContext} ctx
 * @param {object} instance
 * @param {{ id: string; symbol: string; decimals: number }} tokenMeta
 */
async function verifyInstance(ctx, instance, tokenMeta) {
  /** @type {import('../lib/report.mjs').Mismatch[]} */
  const mismatches = [];
  let checked = 0;
  let skipped = 0;

  if (ctx.skipCrosschain && instance.crosschainInProgress) {
    return { checked, skipped: 1, mismatches };
  }

  const chain = await resolveEntityChain(ctx, instance);
  if (!chain) {
    return { checked, skipped: 1, mismatches };
  }
  const client = chain.client;
  const chainLabel = instance.blockchain?.name ?? chain.chainName;
  const symbol = tokenMeta.symbol ?? instance.tokenId;
  const latestOnly = Boolean(ctx.smokeOptions.latestSnapshotOnly);
  const allInstances = Boolean(ctx.smokeOptions.allInstances);
  const withLive = Boolean(ctx.smokeOptions.withLive);
  const deepMode =
    Boolean(ctx.smokeOptions.sinceCreation) ||
    ctx.smokeOptions.symbol ||
    ctx.smokeOptions.tokenId ||
    ctx.filters.tokenId ||
    allInstances;

  if (!latestOnly && (!allInstances || withLive || !deepMode)) {
    const live = await checkSupply(
      ctx,
      client,
      instance.address,
      BigInt(instance.totalIssuance ?? "0"),
      undefined,
      `${symbol}@${chainLabel}`
    );
    if (live.skipped) skipped += 1;
    else {
      checked += 1;
      if (live.mismatch) mismatches.push(live.mismatch);
    }
  }

  if (deepMode) {
    const snapshots = await fetchSnapshots(ctx, tokenMeta.id, instance.centrifugeId);
    for (const snap of snapshots) {
      const snapResult = await checkSupply(
        ctx,
        client,
        instance.address,
        BigInt(snap.totalIssuance ?? "0"),
        BigInt(snap.blockNumber),
        `${symbol}@${chainLabel}`
      );
      if (snapResult.skipped) skipped += 1;
      else {
        checked += 1;
        if (snapResult.mismatch) mismatches.push(snapResult.mismatch);
      }
    }
  }

  return { checked, skipped, mismatches };
}

/**
 * @param {import('../lib/context.mjs').SmokeContext} ctx
 */
export async function runSmoke(ctx) {
  const opts = ctx.smokeOptions;
  /** @type {import('../lib/report.mjs').Mismatch[]} */
  const mismatches = [];
  let checked = 0;
  let skipped = 0;

  if (opts.allInstances) {
    const instances = await ctx.paginate(ALL_INSTANCES_QUERY, "tokenInstances");
    const filtered = ctx.filters.chain
      ? instances.filter((i) => passesChainFilter(ctx, i))
      : instances;

    const results = await mapPool(filtered, ctx.concurrency, async (instance) => {
      if (!instance.token) return { checked: 0, skipped: 1, mismatches: [] };
      return verifyInstance(ctx, instance, instance.token);
    });
    for (const r of results) {
      checked += r.checked;
      skipped += r.skipped;
      mismatches.push(...r.mismatches);
    }
    return { checked, skipped, mismatches };
  }

  if (opts.symbol) {
    const data = await ctx.gql(TOKEN_BY_SYMBOL, { symbol: opts.symbol });
    const token = data.tokens?.items?.[0];
    if (!token) throw new Error(`Token not found: ${opts.symbol}`);
    for (const instance of token.tokenInstances?.items ?? []) {
      if (!passesChainFilter(ctx, { ...instance, centrifugeId: instance.centrifugeId })) continue;
      const r = await verifyInstance(ctx, instance, token);
      checked += r.checked;
      skipped += r.skipped;
      mismatches.push(...r.mismatches);
    }
    return { checked, skipped, mismatches };
  }

  if (opts.tokenId || ctx.filters.tokenId) {
    const id = opts.tokenId ?? ctx.filters.tokenId;
    const data = await ctx.gql(TOKEN_BY_ID, { id });
    if (!data.token) throw new Error(`Token not found: ${id}`);
    for (const instance of data.token.tokenInstances?.items ?? []) {
      if (!passesChainFilter(ctx, { ...instance, centrifugeId: instance.centrifugeId })) continue;
      const r = await verifyInstance(ctx, instance, data.token);
      checked += r.checked;
      skipped += r.skipped;
      mismatches.push(...r.mismatches);
    }
    return { checked, skipped, mismatches };
  }

  let instances = await ctx.paginate(ALL_INSTANCES_QUERY, "tokenInstances");
  instances = ctx.sampleCandidates(
    instances.filter((i) => i.isActive !== false),
    (i) => `${i.centrifugeId}:${i.token?.poolId ?? "?"}:${i.tokenId}`
  );
  if (ctx.filters.chain) instances = instances.filter((i) => passesChainFilter(ctx, i));

  for (const instance of instances) {
    if (!instance.token) {
      skipped += 1;
      continue;
    }
    const r = await verifyInstance(ctx, instance, instance.token);
    checked += r.checked;
    skipped += r.skipped;
    mismatches.push(...r.mismatches);
  }

  return { checked, skipped, mismatches };
}
