import { createConfig, factory } from "ponder";
import { getAbiItem, http } from "viem";

import { HubRegistryAbi } from "./abis/HubRegistryAbi";
import { PoolManagerAbi } from "./abis/PoolManagerAbi";
import { ShareClassManagerAbi } from "./abis/ShareClassManagerAbi";
import { BaseVaultAbi } from "./abis/BaseVaultAbi";

import { chains } from "./chains";
const currentNetwork = chains['testnet']

export default createConfig({
  networks: {
    sepolia: {
      chainId: currentNetwork.chainId,
      transport: http(process.env.PONDER_RPC_URL_1),
    },
  },
  blocks: {
    sepolia: {
      network: "sepolia",
      startBlock: currentNetwork.startBlock,
      interval: 300,
    },
  },
  contracts: {
    PoolRegistry: {
      network: "sepolia",
      abi: HubRegistryAbi,
      address: currentNetwork.contracts.hubRegistry,
      startBlock: currentNetwork.startBlock,
    },
    ShareClassManager: {
      network: "sepolia",
      abi: ShareClassManagerAbi,
      address: currentNetwork.contracts.shareClassManager,
      startBlock: currentNetwork.startBlock,
    },
    PoolManager: {
      network: "sepolia",
      abi: PoolManagerAbi,
      address: currentNetwork.contracts.poolManager,
      startBlock: currentNetwork.startBlock,
    },
    Vault: {
      network: "sepolia",
      address: factory({
        address: currentNetwork.contracts.poolManager,
        event: getAbiItem({ abi: PoolManagerAbi, name: "DeployVault" }),
        parameter: "vault",
      }),
      abi: BaseVaultAbi,
      startBlock: currentNetwork.startBlock,
    },
  },
});
