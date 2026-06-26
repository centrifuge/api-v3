/**
 * Hub–spoke multichain helpers for smoke tests.
 *
 * Centrifuge V3 uses CREATE3 deterministic deployments: the same contract address
 * often appears on many EVM chains, but each chain has **independent state**. Smokes
 * must always pair indexed rows with RPC + `deployment(chainId)` for that row's
 * `centrifugeId` (spoke/local network), never assume Ethereum or a single global chain.
 *
 * @see test/smoke/specs/hub-spoke.md
 */

/**
 * Stable smoke `entityId` prefix for a row on a logical network.
 *
 * @param {string | number} centrifugeId
 * @param {string} [chainName]
 * @param {string} rest
 */
export function entityIdOnNetwork(centrifugeId, chainName, rest) {
  const net = chainName ? `${centrifugeId}@${chainName}` : String(centrifugeId);
  return `${net}:${rest}`;
}

/**
 * @param {import('viem').PublicClient} client
 * @param {`0x${string}`} address
 * @param {bigint | undefined} [blockNumber]
 */
export async function hasContractCode(client, address, blockNumber) {
  const code = await client.getBytecode({ address, blockNumber });
  return Boolean(code && code !== "0x");
}
