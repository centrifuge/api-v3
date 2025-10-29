/**
 * Chains configuration loaded from IPFS registry
 * 
 * This module loads chain configurations dynamically from an IPFS-hosted registry
 * specified by the REGISTRY_HASH environment variable.
 */

import { getChains } from "./registry";

// Load chains using top-level await
const _chains = await getChains();

export const chains = _chains;

// Build the endpoints mapping from loaded chains
export const endpoints: Record<number, string[]> = (() => {
  const result: Record<number, string[]> = {};
  
  for (const chain of _chains) {
    const chainId = chain.network.chainId;
    const alchemyName = chain.network.alchemyName;
    const quicknodeName = chain.network.quicknodeName;
    
    // Handle special cases
    if (chainId === 98866) {
      // Plume uses Conduit
      result[chainId] = [`rpc.plume.org/${process.env.CONDUIT_API_KEY}`];
    } else if (alchemyName && quicknodeName) {
      // Use registry-provided RPC names
      const endpoints: string[] = [];
      
      // Add Alchemy endpoint
      endpoints.push(`${alchemyName}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
      
      // Add QuickNode endpoint with special handling for different chains
      if (chainId === 43114) {
        // Avalanche needs special path suffix
        endpoints.push(`${process.env.QUICKNODE_API_NAME}.${quicknodeName}/${process.env.QUICKNODE_API_KEY}/ext/bc/C/rpc/`);
      } else if (chainId === 1) {
        // Ethereum mainnet - quicknodeName is just "quiknode.pro"
        endpoints.push(`${process.env.QUICKNODE_API_NAME}.ethereum.${quicknodeName}/${process.env.QUICKNODE_API_KEY}`);
      } else {
        // Other chains have full domain in quicknodeName
        endpoints.push(`${process.env.QUICKNODE_API_NAME}.${quicknodeName}/${process.env.QUICKNODE_API_KEY}`);
      }
      
      result[chainId] = endpoints;
    } else {
      throw new Error(`Chain ${chainId} missing alchemyName or quicknodeName in registry`);
    }
  }
  
  return result;
})();

// Default start blocks - these should be overridden via PONDER_RPC_STARTING_BLOCK_{chainId} env vars
export const startBlocks: Record<number, number> = {
  84532: 28165059,
  421614: 172002761,
  11155111: 8729941,
  42161: 357982308,
  43114: 65492900,
  8453: 32901251,
  1: 22924235,
  98866: 564725,
  56: 54800894,
};

// Skip blocks (polling interval in blocks)
export const skipBlocks: Record<number, number> = {
  84532: 1800,
  421614: 14230,
  11155111: 300,
  42161: 14230,
  43114: 1800,
  8453: 1800,
  1: 300,
  98866: 9000,
  56: 4800,
};

// Network names by chain ID
export const networks: Record<number, string> = {
  84532: "base",
  421614: "arbitrum",
  11155111: "ethereum",
  42161: "arbitrum",
  43114: "avalanche",
  8453: "base",
  1: "ethereum",
  98866: "plume",
  56: "binance",
};
