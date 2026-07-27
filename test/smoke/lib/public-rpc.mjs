/**
 * Chainlist public HTTP RPC fallbacks when `ERPC_BASE_URL` is unset.
 *
 * Every URL MUST appear on Chainlist for that chain:
 * https://chainlist.org/chain/<chainId>
 * Source: https://chainlist.org/rpcs.json
 *
 * Selection: prefer the chain operator endpoint (matches `infoURL` domain) when listed;
 * otherwise the first `tracking: "none"` HTTP URL on Chainlist.
 */
export const PUBLIC_RPC_URLS = {
  // Mainnet — https://chainlist.org/chain/1
  1: ["https://cloudflare-eth.com"],
  // https://chainlist.org/chain/10
  10: ["https://mainnet.optimism.io"],
  // https://chainlist.org/chain/56
  56: ["https://bsc-dataseed.bnbchain.org"],
  // https://chainlist.org/chain/143
  143: ["https://rpc.monad.xyz"],
  // https://chainlist.org/chain/999
  999: ["https://rpc.hyperliquid.xyz/evm"],
  // https://chainlist.org/chain/1672
  1672: ["https://rpc.pharos.xyz"],
  // https://chainlist.org/chain/8453
  8453: ["https://mainnet.base.org"],
  // https://chainlist.org/chain/98866
  98866: ["https://rpc.plume.org"],
  // https://chainlist.org/chain/42161
  42161: ["https://arb1.arbitrum.io/rpc"],
  // https://chainlist.org/chain/43114
  43114: ["https://api.avax.network/ext/bc/C/rpc"],
  // Testnet — https://chainlist.org/chain/998
  998: ["https://rpc.hyperliquid-testnet.xyz/evm"],
  // https://chainlist.org/chain/84532
  84532: ["https://sepolia.base.org"],
  // https://chainlist.org/chain/11155111
  11155111: ["https://rpc.sepolia.org"],
  // https://chainlist.org/chain/421614
  421614: ["https://sepolia-rollup.arbitrum.io/rpc"],
};

/**
 * @param {number} chainId
 * @returns {string[]}
 */
export function publicRpcUrlsForChain(chainId) {
  const urls = PUBLIC_RPC_URLS[chainId];
  return urls ? [...urls] : [];
}
