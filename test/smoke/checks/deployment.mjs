import { parseAbi } from "viem";

const GATEWAY_ABI = parseAbi(["function localCentrifugeId() view returns (uint16)"]);

const DEPLOYMENTS_QUERY = `
  query Deployments($limit: Int!) {
    deployments(limit: $limit) {
      items { chainId centrifugeId gateway blockchain { name } }
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

  const rows = await ctx.gql(DEPLOYMENTS_QUERY, { limit: 50 });
  const deployments = rows.deployments?.items ?? [];

  for (const dep of deployments) {
    if (!dep.gateway) {
      skipped += 1;
      continue;
    }
    if (ctx.filters.chain && dep.blockchain?.name !== ctx.filters.chain) continue;
    if (ctx.filters.centrifugeId && String(dep.centrifugeId) !== ctx.filters.centrifugeId) {
      continue;
    }

    const chainId = Number(dep.chainId);
    let client;
    try {
      client = ctx.client(chainId);
    } catch {
      skipped += 1;
      continue;
    }

    checked += 1;
    const onchain = await client.readContract({
      address: dep.gateway,
      abi: GATEWAY_ABI,
      functionName: "localCentrifugeId",
      blockNumber: ctx.atBlock,
    });
    if (String(onchain) !== String(dep.centrifugeId)) {
      mismatches.push(
        ctx.mismatch({
          entityId: `deployment:${dep.blockchain?.name ?? dep.chainId}`,
          field: "centrifugeId",
          indexed: String(dep.centrifugeId),
          onchain: String(onchain),
        })
      );
    }
  }

  return { checked, skipped, mismatches };
}
