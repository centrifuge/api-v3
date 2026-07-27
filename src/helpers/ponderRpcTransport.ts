import { fallback, http, type Transport } from "viem";

const DEFAULT_RPC_TIMEOUT_MS = 60_000;

/**
 * JSON-RPC request timeout for Ponder sync (ms). Ponder passes 10s to transports; this value is used instead.
 *
 * @returns Timeout from `PONDER_RPC_TIMEOUT_MS` or {@link DEFAULT_RPC_TIMEOUT_MS}
 */
export function getPonderRpcTimeoutMs(): number {
  const raw = process.env.PONDER_RPC_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_RPC_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RPC_TIMEOUT_MS;
}

/**
 * Viem transport for Ponder `chains` config: fallback over URLs with a configurable timeout.
 *
 * Ponder always invokes the transport factory with `timeout: 10_000`; inner `http` transports are
 * created with {@link getPonderRpcTimeoutMs} so slow `eth_getLogs` (e.g. Monad) can complete.
 *
 * @param urls - RPC HTTP(S) endpoints (first wins; later URLs are fallbacks)
 * @returns Ponder-compatible {@link Transport}
 */
export function createPonderRpcTransport(urls: readonly string[]): Transport {
  const timeout = getPonderRpcTimeoutMs();
  const httpTransports = urls.map((url) => http(url, { timeout, retryCount: 0 }));

  return (config) => {
    const inner = {
      chain: config.chain,
      retryCount: config.retryCount ?? 0,
      timeout,
    };
    if (httpTransports.length === 1) {
      return httpTransports[0]!(inner);
    }
    return fallback(httpTransports)(inner);
  };
}
