import { parseAbi } from "viem";
import { poolIdArg, ONCHAIN_NOT_FOUND, tryReadContract } from "../lib/helpers.mjs";
import { resolveCentrifugeChain } from "../lib/context.mjs";

const HUB_REGISTRY_ABI = parseAbi([
  "function currency(uint64 poolId) view returns (uint128)",
  "function decimals(uint64 poolId) view returns (uint8)",
]);

const POOLS_QUERY = `
  query Pools($limit: Int!, $after: String) {
    pools(limit: $limit, after: $after, orderBy: "id", orderDirection: "asc") {
      items { id centrifugeId currency decimals blockchain { name } }
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

  let pools = await ctx.paginate(POOLS_QUERY, "pools");
  if (ctx.filters.poolId) pools = pools.filter((p) => String(p.id) === String(ctx.filters.poolId));
  pools = ctx.sampleCandidates(pools, (p) => String(p.id));

  for (const pool of pools) {
    const chain = await resolveCentrifugeChain(ctx, pool.centrifugeId);
    if (!chain?.deployment.hubRegistry) {
      skipped += 1;
      continue;
    }

    const poolId = poolIdArg(pool.id);
    const chainLabel = pool.blockchain?.name ?? chain.chainName;

    const currencyResult = await tryReadContract(() =>
      chain.client.readContract({
        address: chain.deployment.hubRegistry,
        abi: HUB_REGISTRY_ABI,
        functionName: "currency",
        args: [poolId],
        blockNumber: ctx.atBlock,
      })
    );

    if (!currencyResult.ok) {
      if (currencyResult.revert) {
        checked += 1;
        if (pool.currency != null && BigInt(pool.currency) !== 0n) {
          mismatches.push(
            ctx.mismatch({
              entityId: `pool:${pool.id}@${chainLabel}`,
              field: "currency",
              indexed: String(pool.currency),
              onchain: ONCHAIN_NOT_FOUND,
            })
          );
        }
      } else {
        skipped += 1;
      }
      continue;
    }

    const onCurrency = currencyResult.value;
    checked += 1;
    const indexedCurrency = pool.currency != null ? BigInt(pool.currency) : 0n;
    if (indexedCurrency !== BigInt(onCurrency)) {
      mismatches.push(
        ctx.mismatch({
          entityId: `pool:${pool.id}@${chainLabel}`,
          field: "currency",
          indexed: String(pool.currency ?? "0"),
          onchain: String(onCurrency),
        })
      );
    }

    const decimalsResult = await tryReadContract(() =>
      chain.client.readContract({
        address: chain.deployment.hubRegistry,
        abi: HUB_REGISTRY_ABI,
        functionName: "decimals",
        args: [poolId],
        blockNumber: ctx.atBlock,
      })
    );

    if (!decimalsResult.ok) {
      if (decimalsResult.revert) {
        checked += 1;
        mismatches.push(
          ctx.mismatch({
            entityId: `pool:${pool.id}@${chainLabel}`,
            field: "decimals",
            indexed: String(pool.decimals),
            onchain: ONCHAIN_NOT_FOUND,
            note: `currency=${onCurrency}`,
          })
        );
      } else {
        skipped += 1;
      }
      continue;
    }

    checked += 1;
    if (Number(pool.decimals) !== Number(decimalsResult.value)) {
      mismatches.push(
        ctx.mismatch({
          entityId: `pool:${pool.id}@${chainLabel}`,
          field: "decimals",
          indexed: String(pool.decimals),
          onchain: String(decimalsResult.value),
        })
      );
    }
  }

  return { checked, skipped, mismatches };
}
