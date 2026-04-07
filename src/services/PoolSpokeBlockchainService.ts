import { PoolSpokeBlockchain } from "ponder:schema";
import { Service } from "./Service";

/**
 * Service class for managing the many-to-many relationship between Pools and Spoke Blockchains.
 *
 * This service tracks which spoke blockchains a pool is notified to, based on the Hub::NotifyPool event.
 *
 * @example
 * ```typescript
 * // Create a new pool-spoke-blockchain relationship
 * const poolSpokeBlockchain = await PoolSpokeBlockchainService.getOrInit(context, {
 *   poolId: 123n,
 *   centrifugeId: "1000",
 * }, block);
 * ```
 */
export class PoolSpokeBlockchainService extends Service<typeof PoolSpokeBlockchain> {
  static readonly entityTable = PoolSpokeBlockchain;
  static readonly entityName = "PoolSpokeBlockchain";}
