import { parseAbi } from "viem";
import { forEachBatch, mapPool } from "../lib/helpers.mjs";
import { normAddr } from "../lib/diff.mjs";
import { resolveCentrifugeChain } from "../lib/context.mjs";
import { entityIdOnNetwork, hasContractCode } from "../lib/hubSpoke.mjs";

const ONRAMP_ABI = parseAbi(["function onramp(address asset) view returns (bool)"]);

const MANAGERS_QUERY = `
  query OnOffRampManagers($limit: Int!, $after: String, $where: OnOffRampManagerFilter) {
    onOffRampManagers(limit: $limit, after: $after, orderBy: "address", orderDirection: "asc", where: $where) {
      items { address centrifugeId poolId tokenId }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

const ON_RAMP_ASSETS_QUERY = `
  query OnRampAssets($tokenId: String!, $centrifugeId: String!, $limit: Int!) {
    onRampAssets(where: { tokenId: $tokenId, centrifugeId: $centrifugeId }, limit: $limit) {
      items { assetAddress isEnabled crosschainInProgress }
    }
  }
`;

const ASSETS_QUERY = `
  query ChainAssets($limit: Int!, $after: String, $where: AssetFilter) {
    assets(limit: $limit, after: $after, orderBy: "id", orderDirection: "asc", where: $where) {
      items { address assetTokenId }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

/**
 * @param {import('../lib/context.mjs').SmokeContext} ctx
 */
export async function runSmoke(ctx) {
  /** @type {import('../lib/report.mjs').Mismatch[]} */
  const mismatches = [];
  let checked = 0;
  let skipped = 0;

  const map = await ctx.getBlockchainMap();
  /** @type {Record<string, string>} */
  const where = {};
  if (ctx.filters.centrifugeId) where.centrifugeId = ctx.filters.centrifugeId;
  if (ctx.filters.poolId) where.poolId = ctx.filters.poolId;
  if (ctx.filters.tokenId) where.tokenId = ctx.filters.tokenId;
  if (ctx.smokeOptions.manager) where.address = ctx.smokeOptions.manager;
  if (ctx.filters.chain) {
    const match = [...map.entries()].find(([, v]) => v.name === ctx.filters.chain);
    if (!match) throw new Error(`Unknown chain: ${ctx.filters.chain}`);
    where.centrifugeId = match[0];
  }

  const managers = await ctx.paginate(MANAGERS_QUERY, "onOffRampManagers", { where });

  const checkManager = async (manager) => {
    const chain = await resolveCentrifugeChain(ctx, manager.centrifugeId);
    if (!chain) {
      skipped += 1;
      return;
    }
    const client = chain.client;
    const chainLabel = chain.chainName;

    if (!(await hasContractCode(client, manager.address, ctx.atBlock))) {
      skipped += 1;
      return;
    }
    const chainAssets = (
      await ctx.paginate(ASSETS_QUERY, "assets", { where: { centrifugeId: manager.centrifugeId } })
    )
      .filter((r) => String(r.assetTokenId) === "0" && r.address)
      .map((r) => normAddr(r.address));

    const indexedRows = (
      await ctx.gql(ON_RAMP_ASSETS_QUERY, {
        tokenId: manager.tokenId,
        centrifugeId: manager.centrifugeId,
        limit: 500,
      })
    ).onRampAssets?.items ?? [];

    const indexedEnabled = new Set(
      indexedRows
        .filter((r) => r.isEnabled)
        .filter((r) => !(ctx.skipCrosschain && r.crosschainInProgress))
        .map((r) => normAddr(r.assetAddress))
    );

    /** @type {string[]} */
    const enabledOnchain = [];
    await forEachBatch(chainAssets, ctx.rpcBatch, async (asset) => {
      checked += 1;
      const ok = await client.readContract({
        address: manager.address,
        abi: ONRAMP_ABI,
        functionName: "onramp",
        args: [asset],
        ...(ctx.atBlock != null ? { blockNumber: ctx.atBlock } : {}),
      });
      if (ok) enabledOnchain.push(asset);
    });

    for (const asset of enabledOnchain) {
      const row = indexedRows.find((r) => normAddr(r.assetAddress) === asset);
      if (ctx.skipCrosschain && row?.crosschainInProgress) {
        skipped += 1;
        continue;
      }
      if (!indexedEnabled.has(asset)) {
        mismatches.push(
          ctx.mismatch({
            entityId: entityIdOnNetwork(
              manager.centrifugeId,
              chainLabel,
              `${manager.address}:${asset}`
            ),
            field: "onRampAsset.isEnabled",
            indexed: row ? String(row.isEnabled) : "missing",
            onchain: "true",
          })
        );
      }
    }
  };

  await mapPool(managers, ctx.concurrency, checkManager);
  return { checked, skipped, mismatches };
}
