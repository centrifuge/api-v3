import { PoolSpokeBlockchain } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

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
export class PoolSpokeBlockchainService extends mixinCommonStatics(
  Service<typeof PoolSpokeBlockchain>,
  PoolSpokeBlockchain,
  "PoolSpokeBlockchain"
) {}
