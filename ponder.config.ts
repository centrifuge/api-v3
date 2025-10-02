import {
  BlockConfig,
  createConfig,
  factory,
  mergeAbis,
  ChainConfig,
  ContractConfig,
} from "ponder";
import { getAbiItem } from "viem";

import { HubRegistryAbi } from "./abis/HubRegistryAbi";
import { SpokeAbi } from "./abis/SpokeAbi";
import { ShareClassManagerAbi } from "./abis/ShareClassManagerAbi";
import { MessageDispatcherAbi } from "./abis/MessageDispatcherAbi";
import { HoldingsAbi } from "./abis/HoldingsAbi";
import { BalanceSheetAbi } from "./abis/BalanceSheetAbi";
import { AsyncVaultAbi } from "./abis/AsyncVaultAbi";
import { SyncDepositVaultAbi } from "./abis/SyncDepositVaultAbi";

import { chains as _chains, endpoints, skipBlocks, startBlocks, networks } from "./chains";
import { PoolEscrowFactoryAbi } from "./abis/PoolEscrowFactoryAbi";
import { PoolEscrowAbi } from "./abis/PoolEscrowAbi";
import { OnOffRampManagerFactoryAbi } from "./abis/OnOffRampManagerFactoryAbi";
import { OnOffRampManagerAbi } from "./abis/OnOffRampManagerAbi";
import { MerkleProofManagerFactoryAbi } from "./abis/MerkleProofManagerFactoryAbi";
import { MerkleProofManagerAbi } from "./abis/MerkleProofManagerAbi";
import { GatewayAbi } from "./abis/GatewayAbi";
import { MultiAdapterAbi } from "./abis/MultiAdapterAbi";
import { Erc20Abi } from "./abis/Erc20Abi";
import { HubAbi } from "./abis/HubAbi";

export const selectedNetworks = process.env.SELECTED_NETWORKS!.split(",");
export const currentChains = _chains.filter((chain) =>
  selectedNetworks.includes(chain.network.chainId.toString())
);
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
    const startingBlockOverride = process.env[`PONDER_RPC_STARTING_BLOCK_${chainId}`];
    acc[networkName] = {
      chain: networkName,
      startBlock: startingBlockOverride
        ? parseInt(startingBlockOverride)
        : startBlocks[network.network.chainId],
      interval: skipBlocks[network.network.chainId],
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
      abi: OnOffRampManagerFactoryAbi,
      chain: getContractChain("onOfframpManagerFactory"),
    },
    OnOffRampManager: {
      abi: OnOffRampManagerAbi,
      chain: getContractChain("onOfframpManagerFactory", {
        event: getAbiItem({
          abi: OnOffRampManagerFactoryAbi,
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
      abi: Erc20Abi,
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
    acc[networkName] = {
      address: factoryConfig
        ? factory({
            ...factoryConfig,
            address: network.contracts[contractName],
          })
        : network.contracts[contractName],
      startBlock: startBlocks[network.network.chainId],
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
