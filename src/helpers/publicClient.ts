import { createPublicClient, type PublicClient, type Transport } from "viem";
import { chains, networkNames } from "../chains";

const clients = new Map<number, PublicClient>();

/**
 * Viem public client for an indexed chain (tip `eth_call`s outside the handler's event chain).
 * Uses the same RPC transport as Ponder `chains` config — safe for indexing code (not `ponder:api`).
 * @param chainId - EVM chain id
 */
export function getPublicClient(chainId: number): PublicClient {
  const cached = clients.get(chainId);
  if (cached) return cached;

  const networkKey = networkNames[chainId.toString() as keyof typeof networkNames];
  if (!networkKey) {
    throw new Error(`Public client not found for chainId ${chainId}`);
  }
  const chainConfig = chains[networkKey as keyof typeof chains];
  if (!chainConfig) {
    throw new Error(`Public client not found for chainId ${chainId}`);
  }

  const client = createPublicClient({
    chain: {
      id: chainConfig.id,
      name: networkKey,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: ["https://localhost"] } },
    },
    transport: chainConfig.rpc as Transport,
  });
  clients.set(chainId, client);
  return client;
}
