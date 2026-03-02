import registries from "../../generated";
import { chainContracts, RegistryChains } from "../chains";
import {
  AdapterService,
  BlockchainService,
  DeploymentService,
  WhitelistedInvestorService,
} from "../services";
import { V2_POOLS, V2_MIGRATION_BLOCK, V2_MIGRATION_TIMESTAMP } from "../config";
import { serviceLog } from "../helpers/logger";
import { multiMapper } from "../helpers/multiMapper";

multiMapper("multiAdapter:setup", async ({ context }) => {
  serviceLog("multiAdapterV3:setup");
  const chainId = context.chain.id;
  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const registryValues = Object.values(registries);
  for (const [index, registry] of registryValues.entries()) {
    const contracts = chainContracts(chainId, index);
    const adapters = Object.fromEntries(
      Object.entries(contracts)
        .filter(([key]) => key.endsWith("Adapter") && key !== "multiAdapter")
        .map(([key, address]) => [key.replace("Adapter", ""), address.toLowerCase()])
    );
    const deployment =
      registry.chains[chainId.toString() as keyof typeof registry.chains]?.deployment;
    if (!deployment) continue;
    for (const [adapterName, adapterAddress] of Object.entries(adapters)) {
      serviceLog(
        `Initialising adapter ${adapterName} with address ${adapterAddress} on chain ${chainId}`
      );
      const adapter = await AdapterService.upsert(
        context,
        {
          name: adapterName,
          address: adapterAddress as `0x${string}`,
          centrifugeId: centrifugeId.toString(),
          createdAt: new Date(deployment.deployedAt * 1000),
          createdAtBlock: deployment.startBlock,
          createdAtTxHash: "0x",
        },
        null
      );
      if (!adapter)
        throw new Error(
          `Failed to initialise adapter ${adapterName} with address ${adapterAddress} on chain ${chainId}`
        );
    }
  }
});

multiMapper("hubRegistry:setup", async ({ context }) => {
  const chainId = context.chain.id;
  const currentChain = RegistryChains.find((chain) => chain.network.chainId === chainId);
  if (!currentChain) throw new Error(`Chain ${chainId} not found in registry`);

  const contracts = chainContracts(chainId);
  const _deployment = await DeploymentService.upsert(
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
