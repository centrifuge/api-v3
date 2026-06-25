import { parseAbi } from "viem";
import { diffBigInt } from "../lib/diff.mjs";
import { poolIdArg } from "../lib/helpers.mjs";
import { diverseSample } from "../lib/sample.mjs";
import { resolveEntityChain } from "../lib/context.mjs";
import { ONCHAIN_NOT_FOUND, tryReadContract } from "../lib/helpers.mjs";

const ERC20_ABI = parseAbi(["function totalSupply() view returns (uint256)"]);

const SCM_ABI = parseAbi([
  "function pricePoolPerShare(uint64 poolId, bytes16 scId) view returns (uint128 price, uint64 computedAt)",
  "function totalIssuance(uint64 poolId, bytes16 scId) view returns (uint128)",
]);

const SPOKE_ABI = parseAbi([
  "function pricePoolPerShare(uint64 poolId, bytes16 scId, bool) view returns (uint128 price, uint64 computedAt)",
]);

const HUB_REGISTRY_ABI = parseAbi([
  "function currency(uint64 poolId) view returns (uint128)",
]);

const INSTANCE_SNAPSHOTS_QUERY = `
  query TokenInstanceSnapshotsRecent($limit: Int!, $after: String) {
    tokenInstanceSnapshots(
      limit: $limit
      after: $after
      orderBy: "blockNumber"
      orderDirection: "desc"
    ) {
      items {
        tokenId centrifugeId blockNumber trigger triggerChainId totalIssuance tokenPrice
      }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

const TOKEN_SNAPSHOTS_QUERY = `
  query TokenSnapshotsRecent($limit: Int!, $after: String) {
    tokenSnapshots(limit: $limit, after: $after, orderBy: "blockNumber", orderDirection: "desc") {
      items {
        id blockNumber trigger triggerChainId totalIssuance tokenPrice tokenPriceComputedAt
      }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

const POOL_SNAPSHOTS_QUERY = `
  query PoolSnapshotsRecent($limit: Int!, $after: String) {
    poolSnapshots(limit: $limit, after: $after, orderBy: "blockNumber", orderDirection: "desc") {
      items {
        id blockNumber trigger triggerChainId currency
      }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

const TOKEN_INSTANCE_LOOKUP = `
  query TokenInstanceLookup($tokenId: String!, $centrifugeId: String!) {
    tokenInstances(where: { tokenId: $tokenId, centrifugeId: $centrifugeId }, limit: 1) {
      items {
        address crosschainInProgress
        token { poolId }
        blockchain { id name }
      }
    }
  }
`;

const TOKEN_LOOKUP = `
  query TokenLookup($id: String!) {
    token(id: $id) {
      id poolId centrifugeId
      pool { id centrifugeId blockchain { name } }
    }
  }
`;

const POOL_LOOKUP = `
  query PoolLookup($id: BigInt!) {
    pool(id: $id) {
      id centrifugeId
      blockchain { name }
    }
  }
`;

/**
 * @param {string} tokenId
 */
function scIdFromTokenId(tokenId) {
  return `0x${BigInt(tokenId).toString(16).padStart(32, "0")}`;
}

/**
 * @param {import('../lib/context.mjs').SmokeContext} ctx
 * @param {unknown[]} rows
 * @param {(row: unknown) => string} groupKey
 */
function pickSnapshots(ctx, rows, groupKey) {
  const perType = Number(ctx.smokeOptions.snapshotsPerType ?? 5);
  const buffer = Math.max(perType * 10, perType);
  const capped = rows.slice(0, buffer);
  return diverseSample(capped, perType, groupKey, ctx.sampleSeed);
}

/**
 * @param {import('../lib/context.mjs').SmokeContext} ctx
 */
export async function runSmoke(ctx) {
  const mismatches = [];
  let checked = 0;
  let skipped = 0;

  const types = String(ctx.smokeOptions.types ?? "instance,token,pool")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const triggerFilter = ctx.smokeOptions.snapshotTriggers
    ? String(ctx.smokeOptions.snapshotTriggers).split(",").map((s) => s.trim())
    : null;
  const sinceBlock = ctx.smokeOptions.sinceBlock != null ? BigInt(ctx.smokeOptions.sinceBlock) : null;

  const passesFilters = (row) => {
    if (sinceBlock != null && BigInt(row.blockNumber) < sinceBlock) return false;
    if (triggerFilter && !triggerFilter.some((p) => String(row.trigger ?? "").startsWith(p))) {
      return false;
    }
    return true;
  };

  if (types.includes("instance")) {
    let rows = await ctx.paginate(INSTANCE_SNAPSHOTS_QUERY, "tokenInstanceSnapshots");
    rows = rows.filter(passesFilters);
    rows = pickSnapshots(ctx, rows, (r) => `${r.centrifugeId}:${r.tokenId}`);

    for (const snap of rows) {
      const lookup = await ctx.gql(TOKEN_INSTANCE_LOOKUP, {
        tokenId: snap.tokenId,
        centrifugeId: snap.centrifugeId,
      });
      const inst = lookup.tokenInstances?.items?.[0];
      if (!inst?.address) {
        skipped += 1;
        continue;
      }
      if (ctx.skipCrosschain && inst.crosschainInProgress) {
        skipped += 1;
        continue;
      }

      const chain = await resolveEntityChain(ctx, {
        triggerChainId: snap.triggerChainId,
        centrifugeId: snap.centrifugeId,
        blockchain: inst.blockchain,
      });
      if (!chain) {
        skipped += 1;
        continue;
      }

      const blockNumber = BigInt(snap.blockNumber);
      const chainLabel = inst.blockchain?.name ?? chain.chainName;

      try {
        checked += 1;
        const onchain = await chain.client.readContract({
          address: inst.address,
          abi: ERC20_ABI,
          functionName: "totalSupply",
          blockNumber,
        });
        const diff = diffBigInt(BigInt(snap.totalIssuance ?? "0"), onchain, ctx.tolerance);
        if (!diff.match) {
          mismatches.push(
            ctx.mismatch({
              entityId: `tokenInstanceSnapshot:${snap.tokenId}@${blockNumber}@${chainLabel}`,
              field: "totalIssuance",
              indexed: String(snap.totalIssuance),
              onchain: onchain.toString(),
            })
          );
        }
      } catch {
        skipped += 1;
      }

      if (snap.tokenPrice != null && inst.token?.poolId && chain.deployment.spoke) {
        try {
          checked += 1;
          const [onPrice] = await chain.client.readContract({
            address: chain.deployment.spoke,
            abi: SPOKE_ABI,
            functionName: "pricePoolPerShare",
            args: [poolIdArg(inst.token.poolId), scIdFromTokenId(snap.tokenId), false],
            blockNumber,
          });
          if (BigInt(snap.tokenPrice) !== BigInt(onPrice)) {
            mismatches.push(
              ctx.mismatch({
                entityId: `tokenInstanceSnapshot:${snap.tokenId}@${blockNumber}@${chainLabel}`,
                field: "tokenPrice",
                indexed: String(snap.tokenPrice),
                onchain: String(onPrice),
              })
            );
          }
        } catch {
          skipped += 1;
        }
      }
    }
  }

  if (types.includes("token")) {
    let rows = await ctx.paginate(TOKEN_SNAPSHOTS_QUERY, "tokenSnapshots");
    rows = rows.filter(passesFilters);
    rows = pickSnapshots(ctx, rows, (r) => String(r.id));

    for (const snap of rows) {
      const tokenData = await ctx.gql(TOKEN_LOOKUP, { id: snap.id });
      const token = tokenData.token;
      const poolId = token?.poolId;
      const hubCentrifugeId = token?.pool?.centrifugeId ?? token?.centrifugeId;
      if (!poolId || !hubCentrifugeId) {
        skipped += 1;
        continue;
      }

      const chain = await resolveEntityChain(ctx, {
        triggerChainId: snap.triggerChainId,
        centrifugeId: hubCentrifugeId,
        blockchain: token.pool?.blockchain,
      });
      if (!chain?.deployment.shareClassManager) {
        skipped += 1;
        continue;
      }

      const blockNumber = BigInt(snap.blockNumber);
      const scId = scIdFromTokenId(snap.id);
      const chainLabel = token.pool?.blockchain?.name ?? chain.chainName;

      if (snap.tokenPrice != null) {
        const priceResult = await tryReadContract(() =>
          chain.client.readContract({
            address: chain.deployment.shareClassManager,
            abi: SCM_ABI,
            functionName: "pricePoolPerShare",
            args: [poolIdArg(poolId), scId],
            blockNumber,
          })
        );
        if (!priceResult.ok) {
          skipped += priceResult.revert ? 0 : 1;
          if (priceResult.revert) {
            checked += 1;
            mismatches.push(
              ctx.mismatch({
                entityId: `tokenSnapshot:${snap.id}@${blockNumber}@${chainLabel}`,
                field: "tokenPrice",
                indexed: String(snap.tokenPrice),
                onchain: ONCHAIN_NOT_FOUND,
              })
            );
          }
        } else {
          checked += 1;
          const [onPrice] = priceResult.value;
          if (BigInt(snap.tokenPrice) !== BigInt(onPrice)) {
            mismatches.push(
              ctx.mismatch({
                entityId: `tokenSnapshot:${snap.id}@${blockNumber}@${chainLabel}`,
                field: "tokenPrice",
                indexed: String(snap.tokenPrice),
                onchain: String(onPrice),
              })
            );
          }
        }
      }

      if (snap.totalIssuance != null) {
        const issuanceResult = await tryReadContract(() =>
          chain.client.readContract({
            address: chain.deployment.shareClassManager,
            abi: SCM_ABI,
            functionName: "totalIssuance",
            args: [poolIdArg(poolId), scId],
            blockNumber,
          })
        );
        if (!issuanceResult.ok) {
          skipped += issuanceResult.revert ? 0 : 1;
          if (issuanceResult.revert) {
            checked += 1;
            mismatches.push(
              ctx.mismatch({
                entityId: `tokenSnapshot:${snap.id}@${blockNumber}@${chainLabel}`,
                field: "totalIssuance",
                indexed: String(snap.totalIssuance),
                onchain: ONCHAIN_NOT_FOUND,
              })
            );
          }
        } else {
          checked += 1;
          const diff = diffBigInt(BigInt(snap.totalIssuance), issuanceResult.value, ctx.tolerance);
          if (!diff.match) {
            mismatches.push(
              ctx.mismatch({
                entityId: `tokenSnapshot:${snap.id}@${blockNumber}@${chainLabel}`,
                field: "totalIssuance",
                indexed: String(snap.totalIssuance),
                onchain: issuanceResult.value.toString(),
              })
            );
          }
        }
      }
    }
  }

  if (types.includes("pool")) {
    let rows = await ctx.paginate(POOL_SNAPSHOTS_QUERY, "poolSnapshots");
    rows = rows.filter(passesFilters);
    rows = pickSnapshots(ctx, rows, (r) => String(r.id));

    for (const snap of rows) {
      const poolData = await ctx.gql(POOL_LOOKUP, { id: snap.id });
      const pool = poolData.pool;
      if (!pool?.centrifugeId) {
        skipped += 1;
        continue;
      }

      const chain = await resolveEntityChain(ctx, {
        triggerChainId: snap.triggerChainId,
        centrifugeId: pool.centrifugeId,
        blockchain: pool.blockchain,
      });
      if (!chain?.deployment.hubRegistry) {
        skipped += 1;
        continue;
      }

      const blockNumber = BigInt(snap.blockNumber);
      const chainLabel = pool.blockchain?.name ?? chain.chainName;
      const currencyResult = await tryReadContract(() =>
        chain.client.readContract({
          address: chain.deployment.hubRegistry,
          abi: HUB_REGISTRY_ABI,
          functionName: "currency",
          args: [poolIdArg(snap.id)],
          blockNumber,
        })
      );

      if (!currencyResult.ok) {
        if (currencyResult.revert && snap.currency != null) {
          checked += 1;
          mismatches.push(
            ctx.mismatch({
              entityId: `poolSnapshot:${snap.id}@${blockNumber}@${chainLabel}`,
              field: "currency",
              indexed: String(snap.currency),
              onchain: ONCHAIN_NOT_FOUND,
            })
          );
        } else {
          skipped += 1;
        }
        continue;
      }

      checked += 1;
      if (snap.currency != null && BigInt(snap.currency) !== BigInt(currencyResult.value)) {
        mismatches.push(
          ctx.mismatch({
            entityId: `poolSnapshot:${snap.id}@${blockNumber}@${chainLabel}`,
            field: "currency",
            indexed: String(snap.currency),
            onchain: String(currencyResult.value),
          })
        );
      }
    }
  }

  return { checked, skipped, mismatches };
}
