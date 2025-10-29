/**
 * Registry loader that fetches configuration from IPFS
 * 
 * This module provides async access to the registry loaded from IPFS.
 * The registry is cached after first load for subsequent calls.
 */

interface RegistryChain {
  network: {
    chainId: number;
    environment: string;
    centrifugeId: number;
    name?: string;
    explorer?: string;
    alchemyName?: string;
    quicknodeName?: string;
    icon?: string;
    catapultaNetwork?: string;
    etherscanUrl?: string;
    connectsTo?: string[];
    safeAdmin?: string;
  };
  adapters: {
    wormhole?: {
      wormholeId: string;
      relayer: string;
      deploy: boolean;
    };
    axelar?: {
      axelarId: string;
      gateway: string | null;
      gasService: string | null;
      deploy: boolean;
    };
    layerZero?: {
      endpoint: string;
      layerZeroEid: number;
      deploy: boolean;
    };
  };
  contracts: Record<string, string>;
  deploymentInfo?: Record<string, {
    gitCommit: string;
    timestamp: string;
    version: string;
  }>;
}

interface RegistryAbis {
  [contractName: string]: any[];
}

interface Registry {
  chains: {
    mainnet: Record<string, RegistryChain>;
    testnet: Record<string, RegistryChain>;
  };
  abis: RegistryAbis;
}

let cachedRegistry: Registry | null = null;

/**
 * Fetches the registry from IPFS or the default URL
 * If REGISTRY_HASH is set, uses IPFS. Otherwise, fetches from https://registry.centrifuge.io/
 * 
 * @returns Promise resolving to the registry data
 * @throws Error if the registry cannot be fetched or parsed
 */
export async function loadRegistry(): Promise<Registry> {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const registryHash = process.env.REGISTRY_HASH;
  const url = registryHash 
    ? `https://centrifuge.mypinata.cloud/ipfs/${registryHash}`
    : 'https://registry.centrifuge.io/';
  
  console.log(`Fetching registry from ${url}...`);
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch registry: ${response.statusText}`);
  }

  const registry = await response.json() as Registry;
  
  const mainnetCount = Object.keys(registry.chains.mainnet).length;
  const testnetCount = Object.keys(registry.chains.testnet).length;
  console.log(`✓ Registry loaded: ${mainnetCount} mainnet chains, ${testnetCount} testnet chains, ${Object.keys(registry.abis).length} ABIs`);
  
  cachedRegistry = registry;
  return registry;
}

/**
 * Gets the chains from the registry for the specified environment
 */
export async function getChains(): Promise<RegistryChain[]> {
  const registry = await loadRegistry();
  const environment = process.env.ENVIRONMENT || "mainnet";
  
  if (environment !== "mainnet" && environment !== "testnet") {
    throw new Error(`Invalid ENVIRONMENT: ${environment}. Must be 'mainnet' or 'testnet'`);
  }
  
  const chains = registry.chains[environment];
  console.log(`✓ Using ${environment} chains: ${Object.keys(chains).length} chains`);
  
  return Object.values(chains);
}

/**
 * Gets a specific ABI from the registry
 */
export async function getAbi(contractName: string): Promise<any[]> {
  const registry = await loadRegistry();
  const abi = registry.abis[contractName];
  
  if (!abi) {
    throw new Error(`ABI not found in registry: ${contractName}`);
  }
  
  return abi;
}

/**
 * Gets all ABIs from the registry
 */
export async function getAllAbis(): Promise<RegistryAbis> {
  const registry = await loadRegistry();
  return registry.abis;
}
