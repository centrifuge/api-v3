import { createConfig, factory } from "ponder";
import { getAbiItem, http } from "viem";

import { PoolRegistryAbi } from "./abis/PoolRegistryAbi";
import { PoolManagerAbi } from "./abis/PoolManagerAbi";
import { MultiShareClassAbi } from "./abis/MultiShareClassAbi";
import { VaultAbi } from "./abis/VaultAbi";

import { chains } from "./chains";
const currentNetwork = chains['sepoliaV2']

export default createConfig({
  networks: {
    sepolia: {
      chainId: 11155111,
      transport: http(process.env.PONDER_RPC_URL_1),
    },
  },
  contracts: {
    PoolRegistry: {
      network: "sepolia",
      abi: PoolRegistryAbi,
      address: currentNetwork.contracts.poolRegistry,
      startBlock: currentNetwork.startBlock,
    },
    MultiShareClass: {
      network: "sepolia",
      abi: MultiShareClassAbi,
      address: currentNetwork.contracts.multiShareClass,
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
      abi: VaultAbi,
      startBlock: currentNetwork.startBlock,
    },
  },
});
