import type { Context } from "ponder:registry";
import { EscrowService } from "../services/EscrowService";
import { getCurrentEscrowAddress } from "./getCurrentEscrowAddress";
import type { ReadContractSafeEvent } from "./readContractSafe";

/**
 * Resolves a pool's current escrow address, preferring the indexed database state.
 *
 * A pool can own several escrow rows after a redeployment/migration; the newest indexed row is the
 * current escrow (see {@link EscrowService.getLatest}). Only when the escrow has not been indexed
 * (e.g. deployed before the indexer's start block) does this fall back to reading the
 * `PoolEscrowFactory` on-chain — keeping the RPC call as a last resort off the common path.
 *
 * @param context - Ponder handler context
 * @param event - The event being processed (used to pin the fallback `eth_call` block)
 * @param poolId - The pool whose escrow address is requested
 * @param centrifugeId - The chain the escrow lives on
 * @returns The current escrow address, or `null` when it can be resolved neither from the database
 *   nor on-chain
 */
export async function resolveEscrowAddress(
  context: Context,
  event: ReadContractSafeEvent,
  poolId: bigint,
  centrifugeId: string
): Promise<`0x${string}` | null> {
  const escrow = await EscrowService.getLatest(context, { poolId, centrifugeId });
  if (escrow) return escrow.read().address;

  // Last resort: the escrow has not been indexed, so read it from the factory on-chain.
  return getCurrentEscrowAddress(context, event, poolId);
}
