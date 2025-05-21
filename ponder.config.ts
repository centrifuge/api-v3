import { createConfig, factory, mergeAbis } from "ponder";
import { getAbiItem, http } from "viem";

import { HubRegistryAbi } from "./abis/HubRegistryAbi";
import { PoolManagerAbi } from "./abis/PoolManagerAbi";
import { ShareClassManagerAbi } from "./abis/ShareClassManagerAbi";
import { MessageDispatcherAbi } from "./abis/MessageDispatcherAbi";

import { chains } from "./chains";
import { AsyncVaultAbi } from "./abis/AsyncVaultAbi";
import { SyncDepositVaultAbi } from "./abis/SyncDepositVaultAbi";

export const currentNetwork = chains['testnet']

export default createConfig({
  networks: {
    ethereum: {
      chainId: currentNetwork.chainId,
      transport: http(process.env.PONDER_RPC_URL_1),
    },
  },
  blocks: {
    ethereum: {
      network: "ethereum",
      startBlock: currentNetwork.startBlock,
      interval: 300,
    },
  },
  contracts: {
    HubRegistry: {
      network: "ethereum",
      abi: HubRegistryAbi,
      address: currentNetwork.contracts.hubRegistry,
      startBlock: currentNetwork.startBlock,
    },
    ShareClassManager: {
      network: "ethereum",
      abi: ShareClassManagerAbi,
      address: currentNetwork.contracts.shareClassManager,
      startBlock: currentNetwork.startBlock,
    },
    PoolManager: {
      network: "ethereum",
      abi: PoolManagerAbi,
      address: currentNetwork.contracts.poolManager,
      startBlock: currentNetwork.startBlock,
    },
    Vault: {
      network: "ethereum",
      address: factory({
        address: currentNetwork.contracts.poolManager,
        event: getAbiItem({ abi: PoolManagerAbi, name: "DeployVault" }),
        parameter: "vault",
      }),
      abi: mergeAbis([SyncDepositVaultAbi, AsyncVaultAbi]),
      startBlock: currentNetwork.startBlock,
    },
    MessageDispatcher: {
      network: "ethereum",
      abi: MessageDispatcherAbi,
      address: currentNetwork.contracts.messageDispatcher,
      startBlock: currentNetwork.startBlock,
    },
  },
});
