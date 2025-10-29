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
  chains: Record<string, RegistryChain>;
  abis: RegistryAbis;
}

let cachedRegistry: Registry | null = null;

/**
 * Fetches the registry from IPFS using the REGISTRY_HASH environment variable
 */
export async function loadRegistry(): Promise<Registry> {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const registryHash = process.env.REGISTRY_HASH;
  if (!registryHash) {
    throw new Error("REGISTRY_HASH environment variable is not set");
  }

  const url = `https://centrifuge.mypinata.cloud/ipfs/${registryHash}`;
  
  console.log(`Fetching registry from ${url}...`);
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch registry: ${response.statusText}`);
  }

  const registry = await response.json() as Registry;
  
  if (!registry.chains || typeof registry.chains !== "object") {
    throw new Error("Invalid registry: missing or invalid chains object");
  }
  
  if (!registry.abis || typeof registry.abis !== "object") {
    throw new Error("Invalid registry: missing or invalid abis object");
  }

  console.log(`✓ Registry loaded: ${Object.keys(registry.chains).length} chains, ${Object.keys(registry.abis).length} ABIs`);
  
  cachedRegistry = registry;
  return registry;
}

/**
 * Gets the chains from the registry as an array
 */
export async function getChains(): Promise<RegistryChain[]> {
  const registry = await loadRegistry();
  return Object.values(registry.chains);
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
