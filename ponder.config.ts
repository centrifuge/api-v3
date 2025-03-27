import { createConfig, factory } from "ponder";
import { http } from "viem";

import { PoolRegistryAbi } from "./abis/PoolRegistryAbi";
import { MultiShareClassAbi } from "./abis/MultiShareClassAbi";

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
      address: "0xbb020baa0d0e49bef14091ae7ac0186f578e21fc",
      startBlock: 7936599,
    },
    MultiShareClassAbi: {
      network: "sepolia",
      abi: MultiShareClassAbi,
      address: "0x951d0b299ded4b7fd3511b2889578b28512047b7",
      startBlock: 7936599,
    },
  },
});
