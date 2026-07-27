import { parseAbi } from "viem";
import { poolIdArg } from "../lib/helpers.mjs";
import { resolveCentrifugeChain } from "../lib/context.mjs";

const SCM_ABI = parseAbi([
  "function shareClassCount(uint64 poolId) view returns (uint32)",
]);

const POOLS_QUERY = `
  query Pools($limit: Int!, $after: String) {
    pools(limit: $limit, after: $after, orderBy: "id", orderDirection: "asc") {
      items { id centrifugeId blockchain { name } }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

const TOKEN_COUNT_QUERY = `
  query TokenCount($poolId: BigInt!, $centrifugeId: String!) {
    tokens(where: { poolId: $poolId, centrifugeId: $centrifugeId }, limit: 1) {
      totalCount
    }
  }
`;

/**
 * @param {import('../lib/context.mjs').SmokeContext} ctx
 */
export async function runSmoke(ctx) {
  const mismatches = [];
  let checked = 0;
  let skipped = 0;

  let pools = await ctx.paginate(POOLS_QUERY, "pools");
  if (ctx.filters.poolId) pools = pools.filter((p) => String(p.id) === String(ctx.filters.poolId));

  for (const pool of pools) {
    const chain = await resolveCentrifugeChain(ctx, pool.centrifugeId);
    if (!chain?.deployment.shareClassManager) {
      skipped += 1;
      continue;
    }

    const poolId = poolIdArg(pool.id);
    const chainLabel = pool.blockchain?.name ?? chain.chainName;

    let onCount;
    try {
      onCount = await chain.client.readContract({
        address: chain.deployment.shareClassManager,
        abi: SCM_ABI,
        functionName: "shareClassCount",
        args: [poolId],
        blockNumber: ctx.atBlock,
      });
    } catch {
      skipped += 1;
      continue;
    }

    checked += 1;
    const gqlData = await ctx.gql(TOKEN_COUNT_QUERY, {
      poolId: pool.id,
      centrifugeId: pool.centrifugeId,
    });
    const indexed = gqlData.tokens?.totalCount ?? 0;
    if (Number(indexed) !== Number(onCount)) {
      mismatches.push(
        ctx.mismatch({
          entityId: `pool:${pool.id}@${chainLabel}`,
          field: "tokens.totalCount",
          indexed: String(indexed),
          onchain: String(onCount),
        })
      );
    }
  }

  return { checked, skipped, mismatches };
}
