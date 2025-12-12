import { type ChainConfig } from "ponder";
import registries from "../generated";

// ============================================================================
// Registry Types
// ============================================================================

export type RegistryVersions = keyof typeof registries;
export type Registry<V extends RegistryVersions> = (typeof registries)[V];
export type RegistryChains<V extends RegistryVersions> = V extends RegistryVersions
  ? Registry<V>["chains"]
  : never;

export type RegistryChainsKeys<V extends RegistryVersions> = V extends RegistryVersions
  ? keyof RegistryChains<V>
  : never;

export type RegistryChainsValues<V extends RegistryVersions> = V extends RegistryVersions
  ? RegistryChains<V>[keyof RegistryChains<V>]
  : never;

type ChainsConfig<V extends RegistryVersions> = Record<
  NetworkNames<V>,
  ChainConfig
>;

export const networkNames = {
  "84532": "base",
  "421614": "arbitrum",
  "11155111": "ethereum",
  "42161": "arbitrum",
  "43114": "avalanche",
  "8453": "base",
  "1": "ethereum",
  "98866": "plume",
  "56": "binance",
} as const;

type ExtractNetworkNamesFromKeys<K> = 
  K extends keyof typeof networkNames 
    ? (typeof networkNames)[K]
    : never;

export type NetworkNames<V> = 
  V extends RegistryVersions
    ? ExtractNetworkNamesFromKeys<RegistryChainsKeys<V>>
    : never;

// Load and deduplicate the registry chains
let loadedChains: RegistryChainsValues<RegistryVersions>[] = Array.from(
  Object.values(registries)
    .flatMap((registry: Registry<RegistryVersions>) =>
      Object.values(registry.chains)
    )
    .reduce(
      (
        map: Map<number, RegistryChainsValues<RegistryVersions>>,
        chain: RegistryChainsValues<RegistryVersions>
      ) => {
        const chainId = chain.network.chainId;
        const current = map.get(chainId);
        // Compare deployedAtBlock as numbers (parseInt), select the lowest
        if (
          !current ||
          (chain.deployment.endBlock &&
            current.deployment.endBlock &&
            chain.deployment.endBlock < current.deployment.endBlock)
        ) {
          map.set(chainId, chain);
        }
        return map;
      },
      new Map<number, RegistryChainsValues<RegistryVersions>>()
    )
    .values()
) as RegistryChainsValues<RegistryVersions>[];

// Filter out selected chains if SELECTED_NETWORKS is set
const { SELECTED_NETWORKS } = process.env;
const selectedChainIds = SELECTED_NETWORKS?.split(",");

if (selectedChainIds) {
  loadedChains = loadedChains.filter((chain) =>
    selectedChainIds.includes(chain.network.chainId.toString())
  );
}

export { loadedChains as RegistryChains };

export const endpoints = {
  84532: [
    `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `https://${process.env.QUICKNODE_API_NAME}.base-sepolia.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
  ],
  421614: [
    `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `https://${process.env.QUICKNODE_API_NAME}.arbitrum-sepolia.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
  ],
  11155111: [
    `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `https://${process.env.QUICKNODE_API_NAME}.ethereum-sepolia.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
  ],
  42161: [
    `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `https://${process.env.QUICKNODE_API_NAME}.arbitrum-mainnet.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
  ],
  43114: [
    `https://avax-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `https://${process.env.QUICKNODE_API_NAME}.avalanche-mainnet.quiknode.pro/${process.env.QUICKNODE_API_KEY}/ext/bc/C/rpc/`,
  ],
  8453: [
    `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `https://${process.env.QUICKNODE_API_NAME}.base-mainnet.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
  ],
  1: [
    `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `https://${process.env.QUICKNODE_API_NAME}.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
  ],
  98866: [`https://rpc.plume.org/${process.env.CONDUIT_API_KEY}`],
  56: [
    `https://bnb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `https://${process.env.QUICKNODE_API_NAME}.bsc.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
  ],
};

// Package loadedChains into a ChainConfig object for ponder to consume
const chains = Object.fromEntries(
  loadedChains.map((chain) => {
    const chainId = chain.network.chainId;
    const envRpc = process.env[`PONDER_RPC_URL_${chainId}`];
    const networkName =
      networkNames[chainId.toString() as keyof typeof networkNames];
    return [
      networkName,
      {
        id: chain.network.chainId,
        rpc: envRpc ?? endpoints[chainId as keyof typeof endpoints],
      },
    ] as [NetworkNames<RegistryVersions>, ChainConfig];
  })
) as ChainsConfig<RegistryVersions>;

export { chains };

type BlocksConfig = {
  [N in NetworkNames<RegistryVersions> as `${N}`]: {
    startBlock: number;
    interval: number;
    chain: N;
  };
};

export const skipBlocks = {
  "84532": 1800,
  "421614": 14230,
  "11155111": 300,
  "42161": 14230,
  "43114": 1800,
  "8453": 1800,
  "1": 300,
  "98866": 9000,
  "56": 4800,
};

const blocks = Object.fromEntries(
  loadedChains.map((chain) => {
    const chainId = chain.network.chainId;
    const networkName =
      networkNames[chainId.toString() as keyof typeof networkNames];
    return [
      networkName,
      {
        startBlock: chain.deployment.startBlock,
        interval: skipBlocks[chainId.toString() as keyof typeof skipBlocks],
        chain: networkName,
      },
    ];
  })
) as BlocksConfig;

export { blocks };

/**
 * Gets the contract names for a given registry version.
 * @param registryVersion - The registry version to get the contract names for.
 * @returns The contract names for the given registry version.
 */
export function getContractNames<V extends RegistryVersions>(
  registryVersion: V
): string[] {
  return Array.from(
    new Set(
      Object.values(registries[registryVersion].chains).flatMap((chain) =>
        Object.keys(chain.contracts)
      )
    )
  );
}

export const explorerUrls = {
  "84532": "https://sepolia.basescan.org",
  "421614": "https://sepolia.arbiscan.io",
  "11155111": "https://sepolia.etherscan.io",
  "42161": "https://arbiscan.io",
  "43114": "https://snowtrace.io",
  "8453": "https://basescan.org",
  "1": "https://etherscan.io",
  "98866": "https://explorer.plume.org",
  "56": "https://bscscan.com",
};
