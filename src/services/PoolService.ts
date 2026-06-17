import { Pool } from "ponder:schema";
import type { Context, Event } from "ponder:registry";
import { resolveDecimalsForInit } from "../helpers/decimalsResolver";
import { Service } from "./Service";
import { serviceLog } from "../helpers/logger";

/**
 * Service class for managing pool-related operations and interactions with the blockchain.
 * Extends the base Service class with pool-specific functionality including share class management
 * and epoch tracking.
 */
export class PoolService extends Service<typeof Pool> {
  static readonly entityTable = Pool;
  static readonly entityName = "Pool";

  /**
   * Resolves share-class decimals at hub init from `pool.decimals` or pool currency asset.
   * @param context - Ponder context
   * @param event - Handler event
   * @param pool - Indexed pool row
   */
  static async resolveShareClassDecimalsForInit(
    context: Context,
    event: Event,
    pool: PoolService
  ): Promise<number | undefined> {
    const { decimals, currency, centrifugeId } = pool.read();
    if (typeof decimals === "number") return decimals;
    if (currency == null) return undefined;
    return resolveDecimalsForInit(context, event, {
      assetId: currency,
      poolCentrifugeId: centrifugeId,
    });
  }

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

  /**
   * Sets the decimals for the pool currency.
   * @param decimals - ERC-20-style decimal places for the pool currency
   * @returns The PoolService instance for chaining
   */
  public setDecimals(decimals: number) {
    serviceLog(`Setting decimals to ${decimals}`);
    this.data.decimals = decimals;
    return this;
  }
}
