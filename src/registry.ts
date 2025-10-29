/**
 * Registry loader that fetches configuration from IPFS
 * 
 * This module provides both sync and async access to the registry.
 * For sync access, call loadRegistrySync() before importing other modules.
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

/**
 * Gets the cached registry synchronously.
 * Loads it synchronously if not already loaded (lazy loading).
 */
export function getRegistrySync(): Registry {
  if (!cachedRegistry) {
    // Lazy load on first access
    loadRegistrySync();
  }
  return cachedRegistry!;
}

/**
 * Gets chains synchronously from the cached registry
 */
export function getChainsSync(): RegistryChain[] {
  return Object.values(getRegistrySync().chains);
}

/**
 * Gets all ABIs synchronously from the cached registry
 */
export function getAllAbisSync(): RegistryAbis {
  return getRegistrySync().abis;
}

/**
 * Loads the registry synchronously using a simple busy-wait loop.
 * Called automatically by getRegistrySync() on first access (lazy loading).
 */
export function loadRegistrySync(): Registry {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  let done = false;
  let result: Registry | null = null;
  let error: Error | null = null;

  // Trigger async load
  loadRegistry()
    .then((registry) => {
      result = registry;
      done = true;
    })
    .catch((err) => {
      error = err;
      done = true;
    });

  // Simple busy-wait loop (not ideal but necessary for sync loading)
  const start = Date.now();
  while (!done) {
    if (Date.now() - start > 30000) {
      throw new Error('Registry loading timed out after 30 seconds');
    }
    // Small delay to prevent tight CPU spin
    const now = Date.now();
    while (Date.now() - now < 10) { /* busy wait 10ms */ }
  }

  if (error) {
    throw error;
  }

  if (!result) {
    throw new Error('Failed to load registry');
  }

  return result;
}
