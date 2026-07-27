import { parseAbi } from "viem";
import { normAddr } from "../lib/diff.mjs";
import { resolveEntityChain } from "../lib/context.mjs";

const VAULT_REGISTRY_ABI = parseAbi([
  "function vaultDetails(address vault) view returns (uint128 assetId, address asset, uint256 tokenId, bool isLinked)",
  "function isLinked(address vault) view returns (bool)",
]);

const VAULTS_QUERY = `
  query Vaults($limit: Int!, $after: String) {
    vaults(limit: $limit, after: $after, orderBy: "id", orderDirection: "asc") {
      items {
        id centrifugeId status assetId assetAddress poolId tokenId crosschainInProgress
        blockchain { id name }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

const SKIP_CROSSCHAIN = new Set(["Deploy", "Link", "Unlink"]);

/**
 * @param {boolean} linked
 */
function expectedStatus(linked) {
  return linked ? "Linked" : "Unlinked";
}

/**
 * @param {import('../lib/context.mjs').SmokeContext} ctx
 */
export async function runSmoke(ctx) {
  const mismatches = [];
  let checked = 0;
  let skipped = 0;

  let vaults = await ctx.paginate(VAULTS_QUERY, "vaults");
  if (ctx.filters.poolId) vaults = vaults.filter((v) => String(v.poolId) === String(ctx.filters.poolId));
  if (ctx.filters.tokenId) vaults = vaults.filter((v) => String(v.tokenId) === String(ctx.filters.tokenId));
  if (ctx.filters.chain) vaults = vaults.filter((v) => v.blockchain?.name === ctx.filters.chain);
  vaults = ctx.sampleCandidates(vaults, (v) => `${v.centrifugeId}:${v.poolId}:${v.tokenId}`);

  for (const vault of vaults) {
    if (ctx.skipCrosschain && vault.crosschainInProgress && SKIP_CROSSCHAIN.has(vault.crosschainInProgress)) {
      skipped += 1;
      continue;
    }

    const chain = await resolveEntityChain(ctx, vault);
    if (!chain?.deployment.vaultRegistry) {
      skipped += 1;
      continue;
    }

    const vaultAddr = normAddr(vault.id);
    const chainLabel = vault.blockchain?.name ?? chain.chainName;
    checked += 2;

    let details;
    try {
      details = await chain.client.readContract({
        address: chain.deployment.vaultRegistry,
        abi: VAULT_REGISTRY_ABI,
        functionName: "vaultDetails",
        args: [vaultAddr],
        blockNumber: ctx.atBlock,
      });
    } catch {
      skipped += 1;
      continue;
    }

    const linked = await chain.client.readContract({
      address: chain.deployment.vaultRegistry,
      abi: VAULT_REGISTRY_ABI,
      functionName: "isLinked",
      args: [vaultAddr],
      blockNumber: ctx.atBlock,
    });

    const [onAssetId, onAsset] = details;

    if (BigInt(vault.assetId) !== BigInt(onAssetId)) {
      mismatches.push(
        ctx.mismatch({
          entityId: `vault:${vaultAddr}@${chainLabel}`,
          field: "assetId",
          indexed: String(vault.assetId),
          onchain: String(onAssetId),
        })
      );
    }
    if (vault.assetAddress && normAddr(vault.assetAddress) !== normAddr(onAsset)) {
      mismatches.push(
        ctx.mismatch({
          entityId: `vault:${vaultAddr}@${chainLabel}`,
          field: "assetAddress",
          indexed: normAddr(vault.assetAddress),
          onchain: normAddr(onAsset),
        })
      );
    }
    if (vault.status && vault.status !== expectedStatus(linked)) {
      mismatches.push(
        ctx.mismatch({
          entityId: `vault:${vaultAddr}@${chainLabel}`,
          field: "status",
          indexed: String(vault.status),
          onchain: expectedStatus(linked),
        })
      );
    }
  }

  return { checked, skipped, mismatches };
}
