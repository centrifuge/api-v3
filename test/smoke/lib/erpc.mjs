/** Network architecture segment in eRPC URL paths (between project base and chain id). */
export const ERPC_ARCHITECTURE = process.env.ERPC_ARCHITECTURE?.trim() || "evm";

/**
 * @returns {boolean}
 */
export function isErpcConfigured() {
  return Boolean(process.env.ERPC_BASE_URL?.trim());
}

/**
 * Build eRPC HTTP RPC URL for a chain.
 *
 * `ERPC_BASE_URL` includes the project segment (e.g. `https://erpc.cfg.embrio.tech/main`).
 * Produces: `{ERPC_BASE_URL}/evm/{chainId}?secret={ERPC_API_KEY}` when the key is set.
 *
 * @see https://docs.erpc.cloud/operation/url
 * @see https://docs.erpc.cloud/config/auth
 * @param {number} chainId
 * @returns {{ urls: string[] } | null}
 */
export function erpcRpcConfigForChain(chainId) {
  const base = process.env.ERPC_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) return null;

  const apiKey = process.env.ERPC_API_KEY?.trim();
  const path = `${base}/${ERPC_ARCHITECTURE}/${chainId}`;
  const url = apiKey
    ? `${path}?secret=${encodeURIComponent(apiKey)}`
    : path;

  return { urls: [url] };
}

/**
 * @param {number} chainId
 * @returns {string | null}
 */
export function erpcRpcUrlForChain(chainId) {
  return erpcRpcConfigForChain(chainId)?.urls[0] ?? null;
}
