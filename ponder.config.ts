import { createConfig } from "ponder";
import { chains, blocks } from "./src/chains";
import { decorateDeploymentContracts } from "./src/contracts";
import { ERC20Abi } from "./abis/ERC20";
import { inspect } from "util";


export const contracts = decorateDeploymentContracts(
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

// const config = {
//   ordering: "omnichain" as const,
//   chains,
//   blocks,
//   contracts,
// };

// Enhanced console.log with deep serialization
const deepLog = (label: string, obj: unknown, depth = 10) => {
  console.log(
    `${label}:`,
    inspect(obj, {
      depth,
      colors: false,
      showHidden: false,
      compact: false,
      maxArrayLength: null,
      maxStringLength: null,
      breakLength: 120,
    })
  );
};

deepLog("chains", chains);
deepLog("contracts", contracts);
deepLog("blocks", blocks);

export default createConfig({
  ordering: "omnichain",
  chains,
  contracts,
  blocks,
});
