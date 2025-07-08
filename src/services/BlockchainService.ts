import type { Context } from "ponder:registry";
import { Blockchain } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing blockchain-related operations and data.
 * 
 * This service extends the base Service class with blockchain-specific functionality,
 * providing methods to interact with and manipulate blockchain data entities.
 * 
 * @extends {ReturnType<typeof mixinCommonStatics>}
 */
export class BlockchainService extends mixinCommonStatics(Service<typeof Blockchain>, Blockchain, "Blockchain") {
  /**
   * Sets the last period start date for the blockchain.
   * 
   * This method updates the blockchain's last period start timestamp, which is typically
   * used to track the beginning of the most recent operational period or epoch.
   * 
   * @param {Date} lastPeriodStart - The date representing the start of the last period
   * @returns {this} Returns the current BlockchainService instance for method chaining
   * 
   * @example
   * ```typescript
   * const blockchainService = new BlockchainService();
   * blockchainService.setLastPeriodStart(new Date('2024-01-01'));
   * ```
   */
  public setLastPeriodStart(lastPeriodStart: Date) {
    this.data.lastPeriodStart = lastPeriodStart
    return this
  }
}