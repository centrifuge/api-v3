import { parseAbi } from "viem";
import { poolIdArg } from "../lib/helpers.mjs";
import { resolveCentrifugeChain, resolveEntityChain } from "../lib/context.mjs";

const SPOKE_ABI = parseAbi(["function isPoolActive(uint64 poolId) view returns (bool)"]);

const POOL_SPOKES_QUERY = `
  query PoolSpokeLinks($limit: Int!, $after: String) {
    poolSpokeBlockchains(limit: $limit, after: $after, orderBy: "poolId", orderDirection: "asc") {
      items {
        poolId centrifugeId
        blockchain { id name }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

const POOLS_QUERY = `
  query Pools($limit: Int!, $after: String) {
    pools(limit: $limit, after: $after, orderBy: "id", orderDirection: "asc") {
      items { id }
      pageInfo { endCursor hasNextPage }
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

  let links = await ctx.paginate(POOL_SPOKES_QUERY, "poolSpokeBlockchains");
  if (ctx.filters.poolId) links = links.filter((r) => String(r.poolId) === String(ctx.filters.poolId));
  if (ctx.filters.chain) links = links.filter((r) => r.blockchain?.name === ctx.filters.chain);
  if (ctx.filters.centrifugeId) {
    links = links.filter((r) => String(r.centrifugeId) === String(ctx.filters.centrifugeId));
  }

  for (const row of links) {
    const chain = await resolveEntityChain(ctx, row);
    if (!chain?.deployment.spoke) {
      skipped += 1;
      continue;
    }

    const chainLabel = row.blockchain?.name ?? chain.chainName;
    checked += 1;
    const onchain = await chain.client.readContract({
      address: chain.deployment.spoke,
      abi: SPOKE_ABI,
      functionName: "isPoolActive",
      args: [poolIdArg(row.poolId)],
      blockNumber: ctx.atBlock,
    });

    if (!onchain) {
      mismatches.push(
        ctx.mismatch({
          entityId: `poolSpoke:${row.poolId}@${chainLabel}`,
          field: "isPoolActive",
          indexed: "link exists",
          onchain: "false",
        })
      );
    }
  }

  const map = await ctx.getBlockchainMap();
  let spokes = [...map.entries()];
  if (ctx.filters.centrifugeId) {
    const filtered = spokes.filter(([cid]) => cid === ctx.filters.centrifugeId);
    spokes.length = 0;
    spokes.push(...filtered);
  }
  if (ctx.filters.chain) {
    const filtered = spokes.filter(([, v]) => v.name === ctx.filters.chain);
    spokes.length = 0;
    spokes.push(...filtered);
  }

  const pools = await ctx.paginate(POOLS_QUERY, "pools");
  const linkSet = new Set(links.map((l) => `${l.poolId}:${l.centrifugeId}`));

  for (const [centrifugeId, chainInfo] of spokes) {
    const chain = await resolveCentrifugeChain(ctx, centrifugeId);
    if (!chain?.deployment.spoke) continue;

    for (const pool of pools) {
      if (ctx.filters.poolId && String(pool.id) !== String(ctx.filters.poolId)) continue;
      checked += 1;
      const active = await chain.client.readContract({
        address: chain.deployment.spoke,
        abi: SPOKE_ABI,
        functionName: "isPoolActive",
        args: [poolIdArg(pool.id)],
        blockNumber: ctx.atBlock,
      });
      if (active && !linkSet.has(`${pool.id}:${centrifugeId}`)) {
        mismatches.push(
          ctx.mismatch({
            entityId: `pool:${pool.id}@${chainInfo.name}`,
            field: "poolSpokeBlockchain",
            indexed: "missing",
            onchain: "isPoolActive=true",
          })
        );
      }
    }
  }

  return { checked, skipped, mismatches };
}
