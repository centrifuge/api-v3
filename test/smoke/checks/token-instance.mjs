import { parseAbi } from "viem";
import { poolIdArg } from "../lib/helpers.mjs";
import { normAddr } from "../lib/diff.mjs";
import { resolveEntityChain } from "../lib/context.mjs";

const SPOKE_ABI = parseAbi([
  "function shareToken(uint64 poolId, bytes16 scId) view returns (address)",
]);

const INSTANCES_QUERY = `
  query TokenInstances($limit: Int!, $after: String) {
    tokenInstances(
      where: { isActive: true }
      limit: $limit
      after: $after
      orderBy: "tokenId"
      orderDirection: "asc"
    ) {
      items {
        tokenId address centrifugeId
        token { poolId }
        blockchain { id name }
      }
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

  let instances = await ctx.paginate(INSTANCES_QUERY, "tokenInstances");
  if (ctx.filters.tokenId) {
    instances = instances.filter((i) => String(i.tokenId) === String(ctx.filters.tokenId));
  }
  instances = ctx.sampleCandidates(
    instances,
    (i) => `${i.centrifugeId}:${i.token?.poolId ?? "?"}:${i.tokenId}`
  );

  for (const inst of instances) {
    const chain = await resolveEntityChain(ctx, inst);
    if (!chain?.deployment.spoke) {
      skipped += 1;
      continue;
    }

    const poolId = poolIdArg(inst.token.poolId);
    const scId = `0x${BigInt(inst.tokenId).toString(16).padStart(32, "0")}`;
    const chainLabel = inst.blockchain?.name ?? chain.chainName;

    checked += 1;
    const onchain = await chain.client.readContract({
      address: chain.deployment.spoke,
      abi: SPOKE_ABI,
      functionName: "shareToken",
      args: [poolId, scId],
      blockNumber: ctx.atBlock,
    });

    if (normAddr(inst.address) !== normAddr(onchain)) {
      mismatches.push(
        ctx.mismatch({
          entityId: `tokenInstance:${inst.tokenId}@${chainLabel}`,
          field: "address",
          indexed: normAddr(inst.address),
          onchain: normAddr(onchain),
        })
      );
    }
  }

  return { checked, skipped, mismatches };
}
