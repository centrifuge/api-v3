import type { Context } from "ponder:registry";
import { Abis, REGISTRY_VERSION_ORDER } from "../contracts";
import { RegistryChains } from "../chains";
import { serviceError } from "./logger";
import { readContractSafe, type ReadContractSafeEvent } from "./readContractSafe";

/**
 * Resolves a pool's current escrow address by reading `PoolEscrowFactory.escrow(poolId)` on the
 * chain the event belongs to.
 *
 * This is the source of truth for the escrow backing a pool on a given spoke chain. It must be used
 * instead of looking the escrow up in the database by `(poolId, centrifugeId)`: a pool can have
 * several `Escrow` rows over its lifetime (the escrow can be redeployed/migrated), and a database
 * lookup has no reliable way to pick the current one. Reading the factory at the event's block
 * always returns the escrow that was active at that point in time.
 *
 * @param context - Ponder handler context (provides the chain-scoped RPC client)
 * @param event - The event being processed (used to pin the `eth_call` block)
 * @param poolId - The pool whose escrow address is requested
 * @returns The current escrow address, or `null` when the factory address is unknown for the chain
 */
export async function getCurrentEscrowAddress(
  context: Context,
  event: ReadContractSafeEvent,
  poolId: bigint
): Promise<`0x${string}` | null> {
  const chainId = context.chain.id;
  const poolEscrowFactory = RegistryChains.find((chain) => chain.network.chainId === chainId)
    ?.contracts.poolEscrowFactory;
  if (!poolEscrowFactory) {
    serviceError(`Pool Escrow Factory address not found for chain ${chainId}`);
    return null;
  }

  const indexerVersion = REGISTRY_VERSION_ORDER[0];
  const poolEscrowFactoryAbi = Abis[indexerVersion as keyof typeof Abis].PoolEscrowFactory;

  return readContractSafe(context, event, {
    abi: poolEscrowFactoryAbi,
    address: poolEscrowFactory.address,
    functionName: "escrow",
    args: [poolId],
  });
}
