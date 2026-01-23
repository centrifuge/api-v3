import { Pool } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { serviceLog } from "../helpers/logger";

/**
 * Service class for managing pool-related operations and interactions with the blockchain.
 * Extends the base Service class with pool-specific functionality including share class management
 * and epoch tracking.
 */
export class PoolService extends mixinCommonStatics(Service<typeof Pool>, Pool, "Pool") {
  /**
   * Sets the metadata for the pool.
   * @param metadata - The metadata to set.
   * @returns The PoolService instance for chaining.
   */
  public setMetadata(metadata: string) {
    serviceLog(`Setting metadata to ${metadata}`);
    this.data.metadata = metadata;
    return this;
  }

  /**
   * Sets the name for the pool.
   * @param name - The name to set.
   * @returns The PoolService instance for chaining.
   */
  public setName(name: string) {
    serviceLog(`Setting name to ${name}`);
    this.data.name = name;
    return this;
  }

  /**
   * Sets the currency for the pool.
   * @param currency - The currency to set.
   * @returns The PoolService instance for chaining.
   */
  public setCurrency(currency: bigint) {
    serviceLog(`Setting currency to ${currency}`);
    this.data.currency = currency;
    return this;
  }
}
