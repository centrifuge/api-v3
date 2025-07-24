import { Escrow } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

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
export class EscrowService extends mixinCommonStatics(
  Service<typeof Escrow>,
  Escrow,
  "Escrow"
) {}
