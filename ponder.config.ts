import {
  BlockConfig,
  createConfig,
  factory,
  mergeAbis,
  ChainConfig,
  ContractConfig,
} from "ponder";

import { getAbiItem } from "viem";
import { HubRegistryAbi, ShareClassManagerAbi, SpokeAbi, AsyncVaultAbi, SyncDepositVaultAbi, MessageDispatcherAbi, HoldingsAbi, BalanceSheetAbi, PoolEscrowFactoryAbi, PoolEscrowAbi, OnOfframpManagerFactoryAbi, OnOfframpManagerAbi, MerkleProofManagerFactoryAbi, MerkleProofManagerAbi, GatewayAbi, MultiAdapterAbi, ERC20Abi, HubAbi } from "./src/abis";
import { chains as _chains, endpoints, skipBlocks, startBlocks, networks } from "./src/chains";

// All chains from the registry (filtered by ENVIRONMENT in registry.ts)
export const currentChains = _chains;
export const currentContractNames = Array.from(new Set(currentChains.flatMap((chain) => Object.keys(chain.contracts)))) as (keyof (typeof currentChains)[number]["contracts"])[];
type Networks = typeof networks[keyof typeof networks];
type Endpoints = typeof endpoints[keyof typeof endpoints];

const chains = currentChains.reduce<Record<Networks, ChainConfig>>(
  (acc, network) => {
    const chainId = network.network.chainId
    const networkName = networks[chainId as keyof typeof networks]
    const chainEndpoints = endpoints[chainId];
    const envRpcEndpoints = process.env[`PONDER_RPC_URL_${chainId}`]?.split(",");
    const hasEnvRpcEndpoints = envRpcEndpoints!! && envRpcEndpoints.length > 0;
    const envWsEndpoint = process.env[`PONDER_WS_URL_${chainId}`];
    const hasEnvWsEndpoint = envWsEndpoint!!;
    
    if (!chainEndpoints) {
      throw new Error(`No RPC endpoints configured for chain ${chainId}`);
    }
    
    acc[networkName as Networks] = {
      id: chainId,
      rpc: hasEnvRpcEndpoints
        ? envRpcEndpoints
        : chainEndpoints.map(endpoint => `https://${endpoint}`),
      ws: hasEnvWsEndpoint ? envWsEndpoint : getWsEndpoint(chainEndpoints),
    };
    return acc;
  },
  {} as Record<Networks, ChainConfig>
);

const blocks = currentChains.reduce<Record<string, BlockConfig>>(
  (acc, network) => {
    const chainId = network.network.chainId;
    const networkName = networks[chainId];
    
    if (!networkName) {
      throw new Error(`No network name configured for chain ${chainId}`);
    }
    
    const startingBlockOverride = process.env[`PONDER_RPC_STARTING_BLOCK_${chainId}`];
    acc[networkName] = {
      chain: networkName,
      startBlock: startingBlockOverride
        ? parseInt(startingBlockOverride)
        : startBlocks[chainId],
      interval: skipBlocks[chainId],
    };
    return acc;
  },
  {} as Record<string, BlockConfig>
);

const config = {
  ordering: "omnichain",
  chains,
  blocks,
  contracts: {
    HubRegistry: {
      abi: HubRegistryAbi,
      chain: getContractChain("hubRegistry"),
    },
    ShareClassManager: {
      abi: ShareClassManagerAbi,
      chain: getContractChain("shareClassManager"),
    },
    Spoke: {
      abi: SpokeAbi,
      chain: getContractChain("spoke"),
    },
    Vault: {
      abi: mergeAbis([SyncDepositVaultAbi, AsyncVaultAbi]),
      chain: getContractChain("spoke", {
        event: getAbiItem({ abi: SpokeAbi, name: "DeployVault" }),
        parameter: "vault",
      }),
    },
    MessageDispatcher: {
      abi: MessageDispatcherAbi,
      chain: getContractChain("messageDispatcher"),
    },
    Holdings: {
      abi: HoldingsAbi,
      chain: getContractChain("holdings"),
    },
    BalanceSheet: {
      abi: BalanceSheetAbi,
      chain: getContractChain("balanceSheet"),
    },
    PoolEscrow: {
      abi: PoolEscrowAbi,
      chain: getContractChain("poolEscrowFactory", {
        event: getAbiItem({
          abi: PoolEscrowFactoryAbi,
          name: "DeployPoolEscrow",
        }),
        parameter: "escrow",
      }),
    },
    PoolEscrowFactory: {
      abi: PoolEscrowFactoryAbi,
      chain: getContractChain("poolEscrowFactory"),
    },
    OnOffRampManagerFactory: {
      abi: OnOfframpManagerFactoryAbi,
      chain: getContractChain("onOfframpManagerFactory"),
    },
    OnOffRampManager: {
      abi: OnOfframpManagerAbi,
      chain: getContractChain("onOfframpManagerFactory", {
        event: getAbiItem({
          abi: OnOfframpManagerFactoryAbi,
          name: "DeployOnOfframpManager",
        }),
        parameter: "manager",
      }),
    },
    MerkleProofManagerFactory: {
      abi: MerkleProofManagerFactoryAbi,
      chain: getContractChain("merkleProofManagerFactory"),
    },
    MerkleProofManager: {
      abi: MerkleProofManagerAbi,
      chain: getContractChain("merkleProofManagerFactory", {
        event: getAbiItem({
          abi: MerkleProofManagerFactoryAbi,
          name: "DeployMerkleProofManager",
        }),
        parameter: "manager",
      }),
    },
    Gateway: {
      abi: GatewayAbi,
      chain: getContractChain("gateway"),
    },
    MultiAdapter: {
      abi: MultiAdapterAbi,
      chain: getContractChain("multiAdapter"),
    },
    TokenInstance: {
      abi: ERC20Abi,
      chain: getContractChain("spoke", {
        event: getAbiItem({
          abi: SpokeAbi,
          name: "AddShareClass",
        }),
        parameter: "token",
      }),
    },
    Hub: {
      abi: HubAbi,
      chain: getContractChain("hub"),
    },
  },
} as const;

export default createConfig(config);

type MultichainContractChain = Exclude<ContractConfig["chain"], string>;

/**
 * Gets the contract chain configuration for a given contract across all networks.
 *
 * @param contractName - The name of the contract to get the chain config for
 * @param factoryConfig - Optional factory configuration for contracts deployed by factories
 * @returns Chain configuration object with network-specific address and start block info
 */
function getContractChain(
  contractName: keyof (typeof currentChains)[number]["contracts"],
  factoryConfig?: Omit<Parameters<typeof factory>[0], "address">
): MultichainContractChain {
  return currentChains.reduce<MultichainContractChain>((acc, network) => {
    const chainId = network.network.chainId
    const networkName = networks[chainId]
    
    if (!networkName) {
      throw new Error(`No network name configured for chain ${chainId}`);
    }
    
    const contractAddress = network.contracts[contractName];
    // Skip chains that don't have this contract instead of throwing an error
    if (!contractAddress) {
      return acc;
    }
    
    const startingBlockOverride = process.env[`PONDER_RPC_STARTING_BLOCK_${chainId}`];
    acc[networkName] = {
      address: factoryConfig
        ? factory({
            ...factoryConfig,
            address: contractAddress as `0x${string}`,
          })
        : (contractAddress as `0x${string}`),
      startBlock: startingBlockOverride
        ? parseInt(startingBlockOverride)
        : startBlocks[chainId],
    };
    return acc;
  }, {} as MultichainContractChain);
}

/**
 * Gets a random websocket endpoint from a list of endpoints.
 *
 * @param chainEndpoints - The list of endpoints to get a random websocket endpoint from
 * @returns A random websocket endpoint
 */
function getWsEndpoint(chainEndpoints: Endpoints) {
  const randomEndpoint = chainEndpoints[Math.floor(Math.random() * chainEndpoints.length)]!;
  return `wss://${randomEndpoint.replace('/rpc', '/ws')}`;
}
