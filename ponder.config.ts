import { createConfig } from "ponder";

import { chains, blocks } from "./src/chains";
import { decorateDeploymentContracts } from "./src/contracts";

export const contracts = decorateDeploymentContracts("v3", [
  "HubRegistry",
  "ShareClassManager",
  "Spoke",
  "MessageDispatcher",
  "Holdings",
  "BalanceSheet",
  "PoolEscrow",
  "PoolEscrowFactory",
  "OnOfframpManagerFactory",
  "MerkleProofManagerFactory",
  "MerkleProofManager",
  "Gateway",
  "MultiAdapter",
  "Hub",
]);

// const config = {
//   ordering: "omnichain" as const,
//   chains,
//   blocks,
//   contracts,
// };

export default createConfig({
  ordering: "omnichain",
  chains,
  contracts,
  blocks,
});
