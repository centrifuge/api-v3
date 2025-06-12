import { createConfig, factory, mergeAbis } from "ponder";
import { getAbiItem, http } from "viem";

import { HubRegistryAbi } from "./abis/HubRegistryAbi";
import { SpokeAbi } from "./abis/SpokeAbi";
import { ShareClassManagerAbi } from "./abis/ShareClassManagerAbi";
import { MessageDispatcherAbi } from "./abis/MessageDispatcherAbi";
import { HoldingsAbi } from "./abis/HoldingsAbi";
import { BalanceSheetAbi } from "./abis/BalanceSheetAbi";
import { AsyncVaultAbi } from "./abis/AsyncVaultAbi";
import { SyncDepositVaultAbi } from "./abis/SyncDepositVaultAbi";

import { chains } from "./chains";

export const currentNetwork = chains['testnet'][0]

export default createConfig({
  networks: {
    ethereum: {
      chainId: currentNetwork.network.chainId,
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
    Spoke: {
      network: "ethereum",
      abi: SpokeAbi,
      address: currentNetwork.contracts.spoke,
      startBlock: currentNetwork.startBlock,
    },
    Vault: {
      network: "ethereum",
      address: factory({
        address: currentNetwork.contracts.spoke,
        event: getAbiItem({ abi: SpokeAbi, name: "DeployVault" }),
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
    Holdings: {
      network: "ethereum",
      abi: HoldingsAbi,
      address: currentNetwork.contracts.holdings,
      startBlock: currentNetwork.startBlock,
    },
    BalanceSheet: {
      network: "ethereum",
        abi: BalanceSheetAbi,
        address: currentNetwork.contracts.balanceSheet,
      startBlock: currentNetwork.startBlock,
    },
  },
});
