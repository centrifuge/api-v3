import { ponder } from "ponder:registry";
import { RegistryChains } from "../chains";
import { DeploymentService, WhitelistedInvestorService } from "../services";
import {
  V2_POOLS,
  V2_MIGRATION_BLOCK,
  V2_MIGRATION_TIMESTAMP,
} from "../config";

ponder.on("hubRegistryV3:setup", async ({ context }) => {
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Need a chain id.");
  const currentChain = RegistryChains.find(
    (chain) => chain.network.chainId === chainId
  );
  if (!currentChain) throw new Error(`Chain ${chainId} not found`);
  const contracts = Object.fromEntries(
    Object.entries(currentChain.contracts).map(
      ([key, value]) => [key, value.address] as [string, `0x${string}`]
    )
  );
  const _deployment = await DeploymentService.insert(
    context,
    {
      chainId: currentChain.network.chainId.toString(),
      centrifugeId: currentChain.network.centrifugeId.toString(),
      ...contracts,
    },
    null
  );

  // Initialize whitelisted investor state for V2 pools.
  // These investors were whitelisted in V2, but the Hub:UpdateRestriction events
  // that would normally create these records were only emitted in V2 and not replayed in V3.
  // We manually initialize their state here to ensure they have proper whitelist records.
  const migrationTimestamp = new Date(V2_MIGRATION_TIMESTAMP * 1000);
  for (const pool of Object.values(V2_POOLS)) {
    for (const accountAddress of pool.whitelistedInvestors) {
      const whitelistedInvestor = (await WhitelistedInvestorService.getOrInit(
        context,
        {
          poolId: pool.poolId,
          tokenId: pool.tokenId,
          centrifugeId: pool.centrifugeId,
          accountAddress: accountAddress as `0x${string}`,
          createdAt: migrationTimestamp,
          createdAtBlock: V2_MIGRATION_BLOCK,
          createdAtTxHash: "0x",
          updatedAt: migrationTimestamp,
          updatedAtBlock: V2_MIGRATION_BLOCK,
          updatedAtTxHash: "0x",
        },
        null
      )) as WhitelistedInvestorService;
      whitelistedInvestor.setValidUntil(null);
      await whitelistedInvestor.save(null);
    }
  }
});
