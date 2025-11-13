import { ponder } from "ponder:registry";
import { currentChains } from "../../ponder.config";
import { DeploymentService, WhitelistedInvestorService } from "../services";
import { V2_POOLS, MAX_UINT64_DATE, V2_MIGRATION_BLOCK, V2_MIGRATION_TIMESTAMP } from "../config";

ponder.on("HubRegistry:setup", async ({ context }) => {
    const chainId = context.chain.id;
    if (typeof chainId !== "number") throw new Error("Need a chain id.");
    const currentChain = currentChains.find(chain => chain.network.chainId === chainId);
    if (!currentChain) {
        throw new Error(`Chain ${chainId} not found`);
    }
    const network = currentChain.network;
    const contracts = currentChain.contracts;
    const _deployment = await DeploymentService.insert(context, {
      chainId: network.chainId.toString(),
      centrifugeId: network.centrifugeId.toString(),
      ...contracts,
    }, null) as DeploymentService | null;

    // Initialize whitelisted investor state for V2 pools.
    // These investors were whitelisted in V2, but the Hub:UpdateRestriction events
    // that would normally create these records were only emitted in V2 and not replayed in V3.
    // We manually initialize their state here to ensure they have proper whitelist records.
    const migrationTimestamp = new Date(V2_MIGRATION_TIMESTAMP * 1000);
    for (const pool of Object.values(V2_POOLS)) {
      for (const accountAddress of pool.whitelistedInvestors) {
        const whitelistedInvestor = await WhitelistedInvestorService.getOrInit(
          context,
          {
            poolId: pool.poolId,
            tokenId: pool.tokenId,
            centrifugeId: pool.centrifugeId,
            accountAddress: accountAddress as `0x${string}`,
            createdAt: migrationTimestamp,
            createdAtBlock: V2_MIGRATION_BLOCK,
            updatedAt: migrationTimestamp,
            updatedAtBlock: V2_MIGRATION_BLOCK,
          },
          null
        ) as WhitelistedInvestorService;
        
        whitelistedInvestor.setValidUntil(MAX_UINT64_DATE);
        await whitelistedInvestor.save(null);
      }
    }
});