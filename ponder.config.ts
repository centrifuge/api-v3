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
      address: "0xF932EFb431c8c881C501fcdFEa237C1f62ed4F55",
      startBlock: 7936599,
    },
    MultiShareClassAbi: {
      network: "sepolia",
      abi: MultiShareClassAbi,
      startBlock: 7936599,
      filter: {
        event: [
          "NewEpoch",
          "AddedShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index, string name, string symbol, bytes32 salt)",
          "AddedShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index)",
        ],
      },
    },
  },
});
