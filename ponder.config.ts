import { createConfig } from "ponder";
import { http } from "viem";

import { PoolManagerAbi } from "./abis/PoolManagerAbi";

export default createConfig({
  networks: {
    mainnet: {
      chainId: 1,
      transport: http(process.env.PONDER_RPC_URL_1),
    },
  },
  contracts: {
    PoolManagerV1: {
      network: "mainnet",
      abi: PoolManagerAbi,
      address: "0x78E9e622A57f70F1E0Ec652A4931E4e278e58142",
      startBlock: 18721030,
    },
    PoolManagerV2: {
      network: "mainnet",
      abi: PoolManagerAbi,
      address: "0x91808B5E2F6d7483D41A681034D7c9DbB64B9E29",
      startBlock: 20432390,
    },
  },
});
