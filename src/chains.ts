import registry from "../generated";

type RegistryVersions = keyof typeof registry;
type Registry = (typeof registry)[RegistryVersions];
//type Networks = keyof Registry['chains'];
type Chain = Registry["chains"][keyof Registry["chains"]];

const { _ENVIRONMENT = "mainnet", SELECTED_NETWORKS } = process.env;

let chains: Chain[] = Object.values(registry.v3.chains);
if (SELECTED_NETWORKS) {
  const selectedNetworks = SELECTED_NETWORKS.split(",");
  const availableChains = chains.map((chain) =>
    chain.network.chainId.toString()
  );
  if (!selectedNetworks.every((network) => availableChains.includes(network)))
    throw new Error("SELECTED_NETWORKS must be contain valid networks");
  chains = chains.filter((chain) =>
    selectedNetworks.includes(chain.network.chainId.toString())
  );
}
export { chains };

export const endpoints = {
  84532: [
    `base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `${process.env.QUICKNODE_API_NAME}.base-sepolia.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
  ],
  421614: [
    `arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `${process.env.QUICKNODE_API_NAME}.arbitrum-sepolia.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
  ],
  11155111: [
    `eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `${process.env.QUICKNODE_API_NAME}.ethereum-sepolia.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
  ],
  42161: [
    `arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `${process.env.QUICKNODE_API_NAME}.arbitrum-mainnet.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
  ],
  43114: [
    `avax-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `${process.env.QUICKNODE_API_NAME}.avalanche-mainnet.quiknode.pro/${process.env.QUICKNODE_API_KEY}/ext/bc/C/rpc/`,
  ],
  8453: [
    `base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `${process.env.QUICKNODE_API_NAME}.base-mainnet.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
  ],
  1: [
    `eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `${process.env.QUICKNODE_API_NAME}.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
  ],
  98866: [`rpc.plume.org/${process.env.CONDUIT_API_KEY}`],
  56: [
    `bnb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    `${process.env.QUICKNODE_API_NAME}.bsc.quiknode.pro/${process.env.QUICKNODE_API_KEY}`,
  ],
} as const;

// export const startBlocks = {
//   84532: 28165059,
//   421614: 172002761,
//   11155111: 8729941,
//   42161: 357982308,
//   43114: 65492900,
//   8453: 32901251,
//   1: 22924235,
//   98866: 564725,
//   56: 54800894,
// } as const;

export const skipBlocks = {
  84532: 1800,
  421614: 14230,
  11155111: 300,
  42161: 14230,
  43114: 1800,
  8453: 1800,
  1: 300,
  98866: 9000,
  56: 4800,
} as const;

export const networks = {
  84532: "base",
  421614: "arbitrum",
  11155111: "ethereum",
  42161: "arbitrum",
  43114: "avalanche",
  8453: "base",
  1: "ethereum",
  98866: "plume",
  56: "binance",
} as const;
