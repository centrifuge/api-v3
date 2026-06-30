import { createPublicClient, defineChain, fallback, http } from "viem";
import { erpcRpcConfigForChain } from "./erpc.mjs";
import { publicRpcUrlsForChain } from "./public-rpc.mjs";

/**
 * @typedef {object} RpcConfig
 * @property {string[]} urls
 */

/**
 * Append unique RPC URLs (case-insensitive dedupe).
 *
 * @param {string[]} urls
 * @param {Set<string>} seen
 * @param {string[]} next
 */
function appendUniqueUrls(urls, seen, next) {
  for (const raw of next) {
    const url = raw.trim();
    const key = url.toLowerCase();
    if (!url || seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
  }
}

/**
 * Resolve RPC for smokes: eRPC first when configured, then Chainlist public fallbacks.
 * viem `fallback` tries each URL in order so a broken eRPC endpoint (e.g. "Unknown block")
 * does not abort the whole smoke run.
 * Smokes do not read `PONDER_RPC_URL_*` (indexer-only).
 *
 * @param {number} chainId
 * @returns {RpcConfig | null}
 */
export function rpcConfigForChain(chainId) {
  /** @type {string[]} */
  const urls = [];
  const seen = new Set();

  const erpc = erpcRpcConfigForChain(chainId);
  if (erpc) appendUniqueUrls(urls, seen, erpc.urls);
  appendUniqueUrls(urls, seen, publicRpcUrlsForChain(chainId));

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
  const transports = urls.map((url) => http(url, { retryCount: 1 }));
  return createPublicClient({
    chain,
    transport: urls.length === 1 ? transports[0] : fallback(transports),
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
