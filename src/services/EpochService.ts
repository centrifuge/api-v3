import type { Context, Event } from "ponder:registry";
import { Epoch } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing Epoch entities in the database.
 * 
 * An Epoch represents a time period in a pool's lifecycle where investment and redemption
 * orders are collected and processed. Each epoch has a specific index within a pool and
 * tracks when it was opened and closed.
 * 
 * This service extends the base Service class with common static methods for CRUD operations
 * and adds epoch-specific functionality like closing epochs.
 * 
 * @extends {Service<typeof Epoch>} - Base service class with CRUD operations
 * @template {typeof Epoch} - The Epoch table type from the schema
 */
export class EpochService extends mixinCommonStatics(Service<typeof Epoch>, Epoch, "Epoch") {
  /**
   * Closes the current epoch by setting the closing timestamp and block number.
   * 
   * This method updates the epoch's `closedAtBlock` and `closedAt` fields to mark
   * the epoch as closed. The closing timestamp is derived from the block timestamp
   * (converted from seconds to milliseconds).
   * 
   * @param context - The database and client context for the operation
   * @param block - The blockchain block information containing number and timestamp
   * @returns The service instance for method chaining
   * 
   * @example
   * ```typescript
   * const epochService = await EpochService.get(context, { poolId: 1, index: 5 });
   * await epochService.close(context, block).save();
   * ```
   */
  close(context: Context, block: Event["block"]) {
    console.info(
      `Closing epoch ${this.data.poolId} ${this.data.index} at block ${block.number}`
    );
    this.data.closedAtBlock = Number(block.number);
    this.data.closedAt = new Date(Number(block.timestamp) * 1000);
    return this;
  }
}