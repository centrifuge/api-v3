import { ponder } from "ponder:registry";
import { RegistryChains, type RegistryVersions, type Registry } from "../chains";
import registries from "../../generated";
import { AdapterService,
DeploymentService, WhitelistedInvestorService } from "../services";
import {
  V2_POOLS,
  V2_MIGRATION_BLOCK,
  V2_MIGRATION_TIMESTAMP,
} from "../config";
import { serviceLog } from "../helpers/logger";

ponder.on("multiAdapterV3:setup", async ({ context }) => {
  serviceLog("multiAdapterV3:setup");
  const chainId = context.chain.id;
  const currentChain = RegistryChains.find(
    (chain) => chain.network.chainId === chainId
  );
  if (!currentChain) throw new Error(`Chain ${chainId} not found in registry`);
  const centrifugeId = currentChain.network.centrifugeId;
  const adapters = Object.fromEntries(Object.entries(currentChain.contracts).filter(([key]) => (key.endsWith("Adapter") && key !== "multiAdapter")).map(([key, value]) => [key.replace("Adapter", ""), value.address.toLowerCase()]));
  for (const [adapterName, adapterAddress] of Object.entries(adapters)) {
    serviceLog(`Initialising adapter ${adapterName} with address ${adapterAddress} on chain ${chainId}`);
    const adapter = await AdapterService.insert(
      context,
      {
        name: adapterName,
        address: adapterAddress,
        centrifugeId: centrifugeId.toString(),
        createdAt: new Date(currentChain.deployment.deployedAt * 1000),
        createdAtBlock: currentChain.deployment.startBlock,
        createdAtTxHash: '0x',
      },
      null
    );
    if (!adapter) throw new Error(`Failed to initialise adapter ${adapterName} with address ${adapterAddress} on chain ${chainId}`);
  }
});

ponder.on("hubRegistryV3:setup", async ({ context }) => {
  const chainId = context.chain.id;
  const currentChain = RegistryChains.find(
    (chain) => chain.network.chainId === chainId
  );
  if (!currentChain) throw new Error(`Chain ${chainId} not found in registry`);
  
  // Collect contracts from all registry versions, keeping the latest version for each contract name
  const versions = Object.keys(registries) as RegistryVersions[];
  const contractsMap = new Map<string, `0x${string}`>();
  
  // Iterate through all versions (later versions will overwrite earlier ones for same contract names)
  for (const version of versions) {
    const registry = registries[version] as Registry<RegistryVersions>;
    const chain = registry.chains[chainId.toString() as keyof typeof registry.chains];
    if (chain && chain.contracts) {
      const contractKeys = Object.keys(chain.contracts) as Array<keyof typeof chain.contracts>;
      for (const contractName of contractKeys) {
        const contract = chain.contracts[contractName];
        if (contract && 'address' in contract) {
          contractsMap.set(contractName as string, contract.address as `0x${string}`);
        }
      }
    }
  }
  
  const contracts = Object.fromEntries(contractsMap);
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