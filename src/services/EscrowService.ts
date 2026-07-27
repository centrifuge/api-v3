import { Escrow } from "ponder:schema";
import type { Context } from "ponder:registry";
import { Service, type ReadOnlyContext } from "./Service";

/**
 * Service class for managing Escrow entities in the database.
 *
 * Provides CRUD operations and database interaction utilities for escrow records
 * that represent pool escrow contracts in the DeFi system. Each escrow is associated
 * with a specific pool and centrifuge ID.
 *
 * Inherits from the base Service class and includes static factory methods for
 * creating, finding, and querying escrow instances.
 *
 * @example
 * ```typescript
 * // Create a new escrow
 * const escrow = await EscrowService.init(context, {
 *   address: "0x...",
 *   poolId: 123n,
 *   centrifugeId: "pool-123"
 * });
 *
 * // Find existing escrow by address
 * const escrow = await EscrowService.get(context, { address: "0x..." });
 *
 * // Query escrows by pool ID
 * const escrows = await EscrowService.query(context, { poolId: 123n });
 * ```
 */
export class EscrowService extends Service<typeof Escrow> {
  static readonly entityTable = Escrow;
  static readonly entityName = "Escrow";

  /**
   * Returns the most recently deployed escrow for a pool on a chain, or `null` if none is indexed.
   *
   * A pool can own several escrow rows over its lifetime (the escrow can be redeployed/migrated),
   * and they all share `(poolId, centrifugeId)`. Escrows for a given pool+chain are deployed on the
   * same chain, so ordering by `createdAtBlock` descending deterministically yields the current one.
   * This replaces an unordered `get`, which returned an arbitrary (effectively oldest) row.
   *
   * @param context - Database context
   * @param query - The pool and chain to look up
   * @returns The newest escrow for the pool/chain, or `null` when none has been indexed
   */
  static async getLatest(
    context: Context | ReadOnlyContext,
    query: { poolId: bigint; centrifugeId: string }
  ): Promise<EscrowService | null> {
    const [escrow] = await EscrowService.query(context, {
      ...query,
      _sort: [{ field: "createdAtBlock", direction: "desc" }],
    });
    return escrow ?? null;
  }
}
