import { parseAbi } from "viem";
import { poolIdArg } from "../lib/helpers.mjs";
import { normAddr } from "../lib/diff.mjs";
import { resolveEntityChain } from "../lib/context.mjs";

const BALANCE_SHEET_ABI = parseAbi([
  "function escrow(uint64 poolId) view returns (address)",
]);

const ESCROWS_QUERY = `
  query Escrows($limit: Int!, $after: String) {
    escrows(limit: $limit, after: $after, orderBy: "poolId", orderDirection: "asc") {
      items {
        address poolId centrifugeId createdAtBlock
        blockchain { id name }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

/**
 * Keep only the newest escrow per (poolId, centrifugeId) — matches EscrowService.getLatest.
 * @param {Array<{ poolId: string | bigint; centrifugeId: string; createdAtBlock?: number | null; address: string; blockchain?: { id?: string; name?: string } }>} escrows
 */
function newestEscrowPerPoolChain(escrows) {
  /** @type {Map<string, (typeof escrows)[number]>} */
  const latest = new Map();
  for (const row of escrows) {
    const key = `${row.centrifugeId}:${row.poolId}`;
    const prev = latest.get(key);
    const block = Number(row.createdAtBlock ?? 0);
    const prevBlock = Number(prev?.createdAtBlock ?? 0);
    if (!prev || block > prevBlock) {
      latest.set(key, row);
    }
  }
  return [...latest.values()];
}

/**
 * @param {import('../lib/context.mjs').SmokeContext} ctx
 */
export async function runSmoke(ctx) {
  const mismatches = [];
  let checked = 0;
  let skipped = 0;

  let escrows = await ctx.paginate(ESCROWS_QUERY, "escrows");
  if (ctx.filters.poolId) {
    escrows = escrows.filter((e) => String(e.poolId) === String(ctx.filters.poolId));
  }
  if (ctx.filters.chain) {
    escrows = escrows.filter((e) => e.blockchain?.name === ctx.filters.chain);
  }
  escrows = newestEscrowPerPoolChain(escrows);
  escrows = ctx.sampleCandidates(escrows, (e) => `${e.centrifugeId}:${e.poolId}`);

  for (const escrow of escrows) {
    const chain = await resolveEntityChain(ctx, escrow);
    if (!chain?.deployment.balanceSheet) {
      skipped += 1;
      continue;
    }

    const chainLabel = escrow.blockchain?.name ?? chain.chainName;
    checked += 1;
    const onchain = await chain.client.readContract({
      address: chain.deployment.balanceSheet,
      abi: BALANCE_SHEET_ABI,
      functionName: "escrow",
      args: [poolIdArg(escrow.poolId)],
      blockNumber: ctx.atBlock,
    });

    if (normAddr(escrow.address) !== normAddr(onchain)) {
      mismatches.push(
        ctx.mismatch({
          entityId: `escrow:pool:${escrow.poolId}@${chainLabel}`,
          field: "address",
          indexed: normAddr(escrow.address),
          onchain: normAddr(onchain),
        })
      );
    }
  }

  return { checked, skipped, mismatches };
}
