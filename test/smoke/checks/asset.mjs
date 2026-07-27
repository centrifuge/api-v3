import { parseAbi } from "viem";
import { normAddr } from "../lib/diff.mjs";
import { ONCHAIN_NOT_FOUND, tryReadContract } from "../lib/helpers.mjs";
import { resolveCentrifugeChain } from "../lib/context.mjs";

const HUB_REGISTRY_ABI = parseAbi([
  "function decimals(uint128 assetId) view returns (uint8)",
]);

const SPOKE_ABI = parseAbi([
  "function idToAsset(uint128 assetId) view returns (address asset, uint256 tokenId)",
  "function assetToId(address asset, uint256 tokenId) view returns (uint128 assetId)",
]);

const REGISTRATIONS_QUERY = `
  query AssetRegistrations($limit: Int!, $after: String) {
    assetRegistrations(limit: $limit, after: $after, orderBy: "assetId", orderDirection: "asc") {
      items { assetId centrifugeId decimals blockchain { name } }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

const SPOKE_ASSETS_QUERY = `
  query SpokeAssets($limit: Int!, $after: String, $where: AssetFilter) {
    assets(limit: $limit, after: $after, orderBy: "id", orderDirection: "asc", where: $where) {
      items {
        id address assetTokenId centrifugeId
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

  let registrations = await ctx.paginate(REGISTRATIONS_QUERY, "assetRegistrations");
  registrations = ctx.sampleCandidates(registrations, (r) => `${r.centrifugeId}:${r.assetId}`);

  for (const reg of registrations) {
    const chain = await resolveCentrifugeChain(ctx, reg.centrifugeId);
    if (!chain?.deployment.hubRegistry) {
      skipped += 1;
      continue;
    }

    const chainLabel = reg.blockchain?.name ?? chain.chainName;
    const decimalsResult = await tryReadContract(() =>
      chain.client.readContract({
        address: chain.deployment.hubRegistry,
        abi: HUB_REGISTRY_ABI,
        functionName: "decimals",
        args: [BigInt(reg.assetId)],
        blockNumber: ctx.atBlock,
      })
    );

    if (!decimalsResult.ok) {
      if (decimalsResult.revert) {
        checked += 1;
        mismatches.push(
          ctx.mismatch({
            entityId: `assetRegistration:${reg.assetId}@${chainLabel}`,
            field: "decimals",
            indexed: String(reg.decimals),
            onchain: ONCHAIN_NOT_FOUND,
          })
        );
      } else {
        skipped += 1;
      }
      continue;
    }

    checked += 1;
    if (Number(reg.decimals) !== Number(decimalsResult.value)) {
      mismatches.push(
        ctx.mismatch({
          entityId: `assetRegistration:${reg.assetId}@${chainLabel}`,
          field: "decimals",
          indexed: String(reg.decimals),
          onchain: String(decimalsResult.value),
        })
      );
    }
  }

  /** @type {Record<string, string>} */
  const where = {};
  if (ctx.filters.centrifugeId) where.centrifugeId = ctx.filters.centrifugeId;
  if (ctx.filters.chain) {
    const map = await ctx.getBlockchainMap();
    const match = [...map.entries()].find(([, v]) => v.name === ctx.filters.chain);
    if (match) where.centrifugeId = match[0];
  }

  let spokeAssets = await ctx.paginate(SPOKE_ASSETS_QUERY, "assets", { where });
  spokeAssets = ctx.sampleCandidates(spokeAssets, (a) => `${a.centrifugeId}:${a.id}`);

  for (const asset of spokeAssets) {
    const chain = await resolveCentrifugeChain(ctx, asset.centrifugeId);
    if (!chain?.deployment.spoke) {
      skipped += 1;
      continue;
    }

    const assetId = BigInt(asset.id);
    const tokenId = BigInt(asset.assetTokenId ?? 0);
    const addr = normAddr(asset.address);
    const chainLabel = asset.blockchain?.name ?? chain.chainName;
    const entityId = `asset:${asset.id}@${chainLabel}`;

    const idToAssetResult = await tryReadContract(() =>
      chain.client.readContract({
        address: chain.deployment.spoke,
        abi: SPOKE_ABI,
        functionName: "idToAsset",
        args: [assetId],
        blockNumber: ctx.atBlock,
      })
    );

    if (!idToAssetResult.ok) {
      if (idToAssetResult.revert) {
        checked += 1;
        mismatches.push(
          ctx.mismatch({
            entityId,
            field: "idToAsset",
            indexed: `${addr}/${tokenId}`,
            onchain: ONCHAIN_NOT_FOUND,
          })
        );
      } else {
        skipped += 1;
      }
      continue;
    }

    const [onAddr, onTokenId] = idToAssetResult.value;
    checked += 1;
    if (normAddr(onAddr) !== addr || BigInt(onTokenId) !== tokenId) {
      mismatches.push(
        ctx.mismatch({
          entityId,
          field: "idToAsset",
          indexed: `${addr}/${tokenId}`,
          onchain: `${normAddr(onAddr)}/${onTokenId}`,
        })
      );
    }

    const assetToIdResult = await tryReadContract(() =>
      chain.client.readContract({
        address: chain.deployment.spoke,
        abi: SPOKE_ABI,
        functionName: "assetToId",
        args: [addr, tokenId],
        blockNumber: ctx.atBlock,
      })
    );

    if (!assetToIdResult.ok) {
      if (assetToIdResult.revert) {
        checked += 1;
        mismatches.push(
          ctx.mismatch({
            entityId,
            field: "assetToId",
            indexed: String(asset.id),
            onchain: ONCHAIN_NOT_FOUND,
          })
        );
      } else {
        skipped += 1;
      }
      continue;
    }

    checked += 1;
    if (BigInt(assetToIdResult.value) !== assetId) {
      mismatches.push(
        ctx.mismatch({
          entityId,
          field: "assetToId",
          indexed: String(asset.id),
          onchain: String(assetToIdResult.value),
        })
      );
    }
  }

  return { checked, skipped, mismatches };
}
