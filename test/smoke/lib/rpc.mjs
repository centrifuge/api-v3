import { createPublicClient, defineChain, fallback, http } from "viem";
import { erpcRpcConfigForChain } from "./erpc.mjs";
import { publicRpcUrlsForChain } from "./public-rpc.mjs";

/**
 * @typedef {object} RpcConfig
 * @property {string[]} urls
 */

/**
 * Resolve RPC for smokes: eRPC when configured, else Chainlist public fallbacks.
 * Smokes do not read `PONDER_RPC_URL_*` (indexer-only).
 *
 * @param {number} chainId
 * @returns {RpcConfig | null}
 */
export function rpcConfigForChain(chainId) {
  const erpc = erpcRpcConfigForChain(chainId);
  if (erpc) return erpc;

  const urls = publicRpcUrlsForChain(chainId);
  if (urls.length === 0) return null;
  return { urls };
}

/**
 * @param {number} chainId
 * @returns {string[]}
 */
export function rpcUrlsForChain(chainId) {
  return rpcConfigForChain(chainId)?.urls ?? [];
}

/**
 * @param {number} chainId
 */
export function rpcClientForChain(chainId) {
  const config = rpcConfigForChain(chainId);
  if (!config) {
    throw new Error(
      `No RPC for chainId ${chainId}. Set ERPC_BASE_URL (+ ERPC_API_KEY) or add a Chainlist fallback in test/smoke/lib/public-rpc.mjs`
    );
  }

  const { urls } = config;
  const chain = defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: urls } },
  });
  return createPublicClient({
    chain,
    transport:
      urls.length === 1 ? http(urls[0]) : fallback(urls.map((url) => http(url))),
  });
}

/** @type {Map<number, import('viem').PublicClient>} */
const clientCache = new Map();

/**
 * @param {number} chainId
 */
export function getClient(chainId) {
  let client = clientCache.get(chainId);
  if (!client) {
    client = rpcClientForChain(chainId);
    clientCache.set(chainId, client);
  }
  return client;
}
