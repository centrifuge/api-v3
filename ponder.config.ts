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
    onOfframpManagerV3 : {
      abi: "OnOfframpManager",
      factory: {
        abi: "OnOfframpManagerFactory",
        eventName: "DeployOnOfframpManager",
        eventParameter: "manager",
      },
    },
    merkleProofManagerV3 : {
      abi: "MerkleProofManager",
      factory: {
        abi: "MerkleProofManagerFactory",
        eventName: "DeployMerkleProofManager",
        eventParameter: "manager",
      },
    },
    tokenInstanceV3 : {
      abi: ERC20Abi,
      factory: {
        abi: "Spoke",
        eventName: "AddShareClass",
        eventParameter: "token",
      },
    },
  } as const,
);

export const contracts = {...contractsV3 };

const config = createConfig({
  ordering: "omnichain",
  chains,
  contracts,
  blocks,
});

export default config;
