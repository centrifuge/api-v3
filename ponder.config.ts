import { createConfig } from "ponder";
import { chains, blocks } from "./src/chains";
import { decorateDeploymentContracts } from "./src/contracts";
import { ERC20Abi } from "./abis/ERC20";
// TODO: enable basin
// import { GrooveBasinAbi } from "./abis/GrooveBasin";
import { V3_1_MIGRATION_BLOCKS } from "./src/config";
// import { BASIN_MAINNET_STATIC } from "./src/config/basin";

export const contractsV3 = decorateDeploymentContracts(
  "v3",
  [
    "BalanceSheet",
    "Gateway",
    "Holdings",
    "HubRegistry",
    "Hub",
    "MerkleProofManagerFactory",
    "MessageDispatcher",
    "MultiAdapter",
    "OnOfframpManagerFactory",
    "PoolEscrowFactory",
    "ShareClassManager",
    "Spoke",
  ] as const,
  {
    vaultV3: {
      abi: ["SyncDepositVault", "AsyncVault"],
      factory: {
        abi: "Spoke",
        eventName: "DeployVault",
        eventParameter: "vault",
      },
    },
    poolEscrowV3: {
      abi: "PoolEscrow",
      factory: {
        abi: "PoolEscrowFactory",
        eventName: "DeployPoolEscrow",
        eventParameter: "escrow",
      },
    },
    onOfframpManagerV3: {
      abi: "OnOfframpManager",
      factory: {
        abi: "OnOfframpManagerFactory",
        eventName: "DeployOnOfframpManager",
        eventParameter: "manager",
      },
    },
    merkleProofManagerV3: {
      abi: "MerkleProofManager",
      factory: {
        abi: "MerkleProofManagerFactory",
        eventName: "DeployMerkleProofManager",
        eventParameter: "manager",
      },
    },
    tokenInstanceV3: {
      abi: ERC20Abi,
      factory: {
        abi: "Spoke",
        eventName: "AddShareClass",
        eventParameter: "token",
      },
    },
  } as const,
  V3_1_MIGRATION_BLOCKS
);

export const contractsV3_1 = decorateDeploymentContracts(
  "v3_1",
  [
    "Accounting",
    "AsyncRequestManager",
    "AsyncVaultFactory",
    "AxelarAdapter",
    "BalanceSheet",
    "BatchRequestManager",
    "ChainlinkAdapter",
    "CircleDecoder",
    "ContractUpdater",
    "Gateway",
    "GasService",
    "Holdings",
    "Hub",
    "HubHandler",
    "HubRegistry",
    "IdentityValuation",
    "LayerZeroAdapter",
    "MessageDispatcher",
    "MessageProcessor",
    "MerkleProofManagerFactory",
    "MultiAdapter",
    "OnOfframpManagerFactory",
    "OracleValuation",
    "PoolEscrowFactory",
    "QueueManager",
    "RefundEscrowFactory",
    "Root",
    "ShareClassManager",
    "SimplePriceManager",
    "Spoke",
    "SubsidyManager",
    "SyncDepositVaultFactory",
    "SyncManager",
    "TokenFactory",
    "TokenRecoverer",
    "VaultDecoder",
    "VaultRouter",
    "VaultRegistry",
    "WormholeAdapter",
  ] as const,
  {
    vaultV3_1: {
      abi: ["SyncDepositVault", "AsyncVault"],
      factory: {
        abi: "VaultRegistry",
        eventName: "DeployVault",
        eventParameter: "vault",
      },
    },
    poolEscrowV3_1: {
      abi: "PoolEscrow",
      factory: {
        abi: "PoolEscrowFactory",
        eventName: "DeployPoolEscrow",
        eventParameter: "escrow",
      },
    },
    onOfframpManagerV3_1: {
      abi: "OnOfframpManager",
      factory: {
        abi: "OnOfframpManagerFactory",
        eventName: "DeployOnOfframpManager",
        eventParameter: "manager",
      },
    },
    merkleProofManagerV3_1: {
      abi: "MerkleProofManager",
      factory: {
        abi: "MerkleProofManagerFactory",
        eventName: "DeployMerkleProofManager",
        eventParameter: "manager",
      },
    },
    tokenInstanceV3_1: {
      abi: [ERC20Abi, "ShareToken"],
      factory: {
        abi: "Spoke",
        eventName: "AddShareClass",
        eventParameter: "token",
      },
    },
    refundEscrowV3_1: {
      abi: "RefundEscrow",
      factory: {
        abi: "RefundEscrowFactory",
        eventName: "DeployRefundEscrow",
        eventParameter: "escrow",
      },
    },
  } as const
);

const protocolContracts = { ...contractsV3, ...contractsV3_1 };

export const contracts = {
  ...protocolContracts,
  // TODO: enable basin
  // groveBasin: {
  //   abi: GrooveBasinAbi,
  //   chain: {
  //     ethereum: {
  //       address: BASIN_MAINNET_STATIC.basinAddress,
  //       startBlock: BASIN_MAINNET_STATIC.startBlock,
  //     },
  //   },
  // },
} as const;

const config = createConfig({
  ordering: "omnichain",
  chains,
  contracts,
  blocks,
});

export default config;
