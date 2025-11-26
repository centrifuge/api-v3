import { createConfig } from "ponder";
import { chains, blocks } from "./src/chains";
import { decorateDeploymentContracts } from "./src/contracts";
import { ERC20Abi } from "./abis/ERC20";


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
    VaultV3: {
      abi: ["SyncDepositVault", "AsyncVault"],
      factory: {
        abi: "Spoke",
        eventName: "DeployVault",
        eventParameter: "vault",
      },
    },
    PoolEscrowV3: {
      abi: "PoolEscrow",
      factory: {
        abi: "PoolEscrowFactory",
        eventName: "DeployPoolEscrow",
        eventParameter: "escrow",
      },
    },
    OnOfframpManagerV3 : {
      abi: "OnOfframpManager",
      factory: {
        abi: "OnOfframpManagerFactory",
        eventName: "DeployOnOfframpManager",
        eventParameter: "manager",
      },
    },
    MerkleProofManagerV3 : {
      abi: "MerkleProofManager",
      factory: {
        abi: "MerkleProofManagerFactory",
        eventName: "DeployMerkleProofManager",
        eventParameter: "manager",
      },
    },
    TokenInstanceV3 : {
      abi: ERC20Abi,
      factory: {
        abi: "Spoke",
        eventName: "AddShareClass",
        eventParameter: "token",
      },
    },
  } as const,
);

export const contractsV3_1 = decorateDeploymentContracts(
  "v3_1",
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
    VaultV3_1: {
      abi: ["SyncDepositVault", "AsyncVault"],
      factory: {
        abi: "Spoke",
        eventName: "DeployVault",
        eventParameter: "vault",
      },
    },
    PoolEscrowV3_1: {
      abi: "PoolEscrow",
      factory: {
        abi: "PoolEscrowFactory",
        eventName: "DeployPoolEscrow",
        eventParameter: "escrow",
      },
    },
    OnOfframpManagerV3_1 : {
      abi: "OnOfframpManager",
      factory: {
        abi: "OnOfframpManagerFactory",
        eventName: "DeployOnOfframpManager",
        eventParameter: "manager",
      },
    },
    MerkleProofManagerV3_1 : {
      abi: "MerkleProofManager",
      factory: {
        abi: "MerkleProofManagerFactory",
        eventName: "DeployMerkleProofManager",
        eventParameter: "manager",
      },
    },
    TokenInstanceV3_1 : {
      abi: ERC20Abi,
      factory: {
        abi: "Spoke",
        eventName: "AddShareClass",
        eventParameter: "token",
      },
    },
  } as const,
);

export const contracts = {...contractsV3, ...contractsV3_1};

const config = createConfig({
  ordering: "omnichain",
  chains,
  contracts,
  blocks,
});

export default config;
