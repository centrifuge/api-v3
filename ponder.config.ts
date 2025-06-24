import { BlockConfig, createConfig, factory, mergeAbis, ChainConfig, ContractConfig } from "ponder";
import { getAbiItem, http, Transport } from "viem";

import { HubRegistryAbi } from "./abis/HubRegistryAbi";
import { SpokeAbi } from "./abis/SpokeAbi";
import { ShareClassManagerAbi } from "./abis/ShareClassManagerAbi";
import { MessageDispatcherAbi } from "./abis/MessageDispatcherAbi";
import { HoldingsAbi } from "./abis/HoldingsAbi";
import { BalanceSheetAbi } from "./abis/BalanceSheetAbi";
import { AsyncVaultAbi } from "./abis/AsyncVaultAbi";
import { SyncDepositVaultAbi } from "./abis/SyncDepositVaultAbi";

import { chains as _chains, endpoints, startBlocks } from "./chains";
import { PoolEscrowFactoryAbi } from "./abis/PoolEscrowFactoryAbi";
import { PoolEscrowAbi } from "./abis/PoolEscrowAbi";

export const selectedNetworks = process.env.SELECTED_NETWORKS!.split(',')
export const currentChains = _chains.filter(chain => selectedNetworks.includes(chain.network.chainId.toString()))
type Networks = typeof currentChains[number]['network']['network']

const chains = currentChains.reduce<Record<Networks, ChainConfig>>((acc, network) => {
  acc[network.network.network] = {
    id: network.network.chainId,
    rpc: `https://${endpoints[network.network.chainId]}`,
    ws: `wss://${endpoints[network.network.chainId]}`,
  }
  return acc
}, {} as Record<Networks, ChainConfig>)

const blocks = currentChains.reduce<Record<string, BlockConfig>>((acc, network) => {
  acc[network.network.network] = {
    chain: network.network.network,
    startBlock: startBlocks[network.network.chainId],
    interval: 300,
  }
  return acc
}, {} as Record<string, BlockConfig>)

const config = {
  ordering: 'omnichain',
  chains,
  blocks,
  contracts: {
    HubRegistry: {
      abi: HubRegistryAbi,
      chain: getContractChain('hubRegistry')
    },
    ShareClassManager: {
      abi: ShareClassManagerAbi,
      chain: getContractChain('shareClassManager')
    },
    Spoke: {
      abi: SpokeAbi,
      chain: getContractChain('spoke')
    },
    Vault: {
      abi: mergeAbis([SyncDepositVaultAbi, AsyncVaultAbi]),
      chain: getContractChain('spoke',{
        event: getAbiItem({ abi: SpokeAbi, name: "DeployVault" }),
        parameter: "vault",
      }),
    },
    MessageDispatcher: {
      abi: MessageDispatcherAbi,
      chain: getContractChain('messageDispatcher')
    },
    Holdings: {
      abi: HoldingsAbi,
      chain: getContractChain('holdings')
    },
    BalanceSheet: {
      abi: BalanceSheetAbi,
      chain: getContractChain('balanceSheet')
    },
    PoolEscrow: {
      abi: PoolEscrowAbi,
      chain: getContractChain('poolEscrowFactory', {
        event: getAbiItem({ abi: PoolEscrowFactoryAbi, name: "DeployPoolEscrow" }),
        parameter: "escrow",
      })
    },
    PoolEscrowFactory: {
      abi: PoolEscrowFactoryAbi,
      chain: getContractChain('poolEscrowFactory')
    },
  },
} as const

console.log(JSON.stringify(config, null, 2))

export default createConfig(config);

type MultichainContractChain = Exclude<ContractConfig['chain'], string>
function getContractChain(contractName: keyof typeof currentChains[number]['contracts'], factoryConfig?: Omit<Parameters<typeof factory>[0], 'address'>): MultichainContractChain {
  return currentChains.reduce<MultichainContractChain>((acc, network) => {
    acc[network.network.network] = {
      address: factoryConfig ? factory({...factoryConfig, address: network.contracts[contractName]}) : network.contracts[contractName],
      startBlock: startBlocks[network.network.chainId],
    }
    return acc
  }, {} as MultichainContractChain)
}
