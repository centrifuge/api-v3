import { createConfig } from "ponder";
import { chains, blocks } from "./src/chains";
import { decorateDeploymentContracts } from "./src/contracts";
import { logIndexingPlan } from "./src/helpers/logger";
import { ERC20Abi } from "./abis/ERC20";
import { V3_1_MIGRATION_BLOCKS } from "./src/config";
import { GrooveBasinAbi } from "./abis/GrooveBasin";
import { SUSDSAbi } from "./abis/SUSDS";
import { getGroveBasinPonderChain, getSelectedBasinStatic } from "./src/config/basin";
import { getSusdsPonderChain } from "./src/config/sky";

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
    "OnOffRampFactory",
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
    onOffRampV3_1: {
      abi: "OnOffRamp",
      factory: {
        abi: "OnOffRampFactory",
        eventName: "DeployOnOffRamp",
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
const groveBasinChain = getGroveBasinPonderChain() as Record<
  string,
  { address: `0x${string}`; startBlock: number }
>;
const susdsChain = getSusdsPonderChain() as Record<
  string,
  { address: `0x${string}`; startBlock: number }
>;

// Stablecoin Transfer feeds for CFGL debt tracking: USDC into the basin (repayments) and
// USDS into the pocket. Only the selected basin deployment's chain is indexed; the zero-
// address filter fallback is inert because the chain map is empty in that case.
const basinStatic = getSelectedBasinStatic();
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const basinUsdcChain: Record<string, { address: `0x${string}`; startBlock: number }> = basinStatic
  ? { ethereum: { address: basinStatic.collateralToken, startBlock: basinStatic.startBlock } }
  : {};
const basinUsdsChain: Record<string, { address: `0x${string}`; startBlock: number }> = basinStatic
  ? { ethereum: { address: basinStatic.swapToken, startBlock: basinStatic.startBlock } }
  : {};

export const contracts = {
  ...protocolContracts,
  groveBasin: {
    abi: GrooveBasinAbi,
    chain: groveBasinChain,
  },
  susds: {
    abi: SUSDSAbi,
    chain: susdsChain,
  } as {
    abi: typeof SUSDSAbi;
    chain: typeof susdsChain;
  },
  basinUsdc: {
    abi: ERC20Abi,
    chain: basinUsdcChain,
    filter: {
      event: "Transfer",
      args: { to: basinStatic?.basinAddress ?? ZERO_ADDRESS },
    },
  } as {
    abi: typeof ERC20Abi;
    chain: typeof basinUsdcChain;
  },
  basinUsds: {
    abi: ERC20Abi,
    chain: basinUsdsChain,
    filter: {
      event: "Transfer",
      args: { to: basinStatic?.pocket ?? ZERO_ADDRESS },
    },
  } as {
    abi: typeof ERC20Abi;
    chain: typeof basinUsdsChain;
  },
} as const;

logIndexingPlan(contracts, blocks);

const config = createConfig({
  ordering: "multichain",
  chains,
  contracts,
  blocks,
});

export default config;
