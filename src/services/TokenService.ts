import { Token, TokenSnapshot } from "ponder:schema";
import type { Context, Event } from "ponder:registry";
import type { ReadOnlyContext } from "./Service";
import { and, asc, desc, gt, inArray, isNotNull, lte } from "drizzle-orm";
import { Service } from "./Service";
import { serviceLog } from "../helpers/logger";
import {
  ALL_TOKEN_YIELD_SNAPSHOT_COLUMN_NAMES,
  type TokenSnapshotPricePoint,
  type TokenYieldSnapshotFields,
  computeTokenYieldSnapshotFields,
  sanitizeTokenYieldSnapshotFields,
  sortTokenYieldPricePoints,
  yieldSnapshotCapTimes,
  yieldSnapshotPointKey,
} from "../helpers/tokenYields";
import { expandInlineObject } from "../helpers/logger";

export type { TokenSnapshotPricePoint };

/**
 * Service class for managing Token entities.
 * Provides methods for activating/deactivating tokens, setting metadata,
 * managing token prices, and controlling total supply.
 *
 * @extends {Service<typeof Token>}
 */
export class TokenService extends Service<typeof Token> {
  static readonly entityTable = Token;
  static readonly entityName = "Token";
  /**
   * Get the decimals of a token.
   * @param context - The context.
   * @param tokenId - The id of the token.
   * @returns The decimals of the token.
   */
  static async getDecimals(context: Context, tokenId: `0x${string}`) {
    const token = (await this.get(context, { id: tokenId })) as TokenService;
    if (!token) return undefined;
    const { decimals } = token.read();
    return decimals;
  }
  /**
   * Activates the token by setting its isActive property to true.
   *
   * @returns {TokenService} The current TokenService instance for method chaining
   */
  public activate() {
    serviceLog(`Activating shareClass ${this.data.id}`);
    this.data.isActive = true;
    return this;
  }

  /**
   * Deactivates the token by setting its isActive property to false.
   *
   * @returns {TokenService} The current TokenService instance for method chaining
   */
  public deactivate() {
    serviceLog(`Deactivating shareClass ${this.data.id}`);
    this.data.isActive = false;
    return this;
  }

  /**
   * Sets the index value for the token.
   *
   * @param {number} index - The index value to set for the token
   * @returns {TokenService} The current TokenService instance for method chaining
   */
  public setIndex(index: number) {
    serviceLog(`Setting index for shareClass ${this.data.id} to ${index}`);
    this.data.index = index;
    return this;
  }

  /**
   * Sets the metadata for the token including name, symbol, and optional salt.
   *
   * @param {string} name - The name of the token
   * @param {string} symbol - The symbol/ticker of the token
   * @param {`0x${string}`} [salt] - Optional salt value as a hex string (0x-prefixed)
   * @returns {TokenService} The current TokenService instance for method chaining
   */
  public setMetadata(name: string, symbol: string, salt?: `0x${string}`) {
    serviceLog(`Setting metadata for shareClass ${this.data.id} to ${name}, ${symbol}`);
    this.data.name = name;
    this.data.symbol = symbol;
    this.data.salt = salt ?? null;
    return this;
  }

  /**
   * Sets the token price in wei (as bigint).
   *
   * @param {bigint} price - The token price in wei
   * @returns {TokenService} The current TokenService instance for method chaining
   */
  public setTokenPrice(price: bigint, computedAt?: Date) {
    serviceLog(
      `Setting price for shareClass ${this.data.id} to ${price} with computedAt ${computedAt}`
    );
    this.data.tokenPrice = price;
    this.data.tokenPriceComputedAt = computedAt ?? null;
    return this;
  }

  /**
   * Increases the totalIssuance of tokens by the specified amount.
   *
   * @param {bigint} tokenAmount - The amount of tokens to add to the totalIssuance
   * @returns {TokenService} The current TokenService instance for method chaining
   * @throws {Error} When totalIssuance is null (not initialized)
   */
  public increaseTotalIssuance(tokenAmount: bigint) {
    const { totalIssuance } = this.data;
    this.data.totalIssuance = totalIssuance ?? 0n + tokenAmount;
    serviceLog(
      `Increased totalIssuance for token ${this.data.id} by ${tokenAmount} to ${this.data.totalIssuance}`
    );
    return this;
  }

  /**
   * Decreases the totalIssuance of tokens by the specified amount.
   *
   * @param {bigint} tokenAmount - The amount of tokens to subtract from the totalIssuance
   * @returns {TokenService} The current TokenService instance for method chaining
   * @throws {Error} When totalIssuance is null (not initialized)
   */
  public decreaseTotalIssuance(tokenAmount: bigint) {
    const { totalIssuance } = this.data;
    this.data.totalIssuance = totalIssuance ?? 0n - tokenAmount;
    serviceLog(
      `Decreased totalIssuance for token ${this.data.id} by ${tokenAmount} to ${this.data.totalIssuance}`
    );
    return this;
  }

  /**
   * Gets the normalised TVL of the tokens.
   * @param context - The context.
   * @returns The normalised TVL of the tokens in fixed point 18 precision.
   */
  static async getNormalisedTvl(context: Context | ReadOnlyContext) {
    const tokens = (await TokenService.query(context, {
      isActive: true,
    })) as TokenService[];
    return tokens.reduce((acc, token) => {
      const { totalIssuance, tokenPrice, decimals } = token.read();
      if (!totalIssuance || !tokenPrice || !decimals) return acc;
      // totalIssuance is in 'decimals' precision, tokenPrice is in 18 precision
      // We want the result in 18 precision
      // product = totalIssuance * tokenPrice has (decimals + 18) precision
      // We need to divide by 10^decimals to normalize to 18 precision
      const product = totalIssuance * tokenPrice;
      return acc + product / 10n ** BigInt(decimals);
    }, 0n);
  }

  /**
   * Gets the normalised aggregated supply of the tokens.
   * @param context - The context.
   * @returns The normalised aggregated supply of the tokens in fixed point 18 precision.
   */
  static async getNormalisedAggregatedSupply(context: Context | ReadOnlyContext) {
    const tokens = (await TokenService.query(context, {})) as TokenService[];
    return tokens.reduce((acc, token) => {
      const { totalIssuance, decimals } = token.read();
      if (!totalIssuance || !decimals) return acc;
      // totalIssuance is in 'decimals' precision, we want the result in 18 precision
      // We need to multiply by 10^18 / 10^decimals to normalize to 18 precision
      return acc + totalIssuance * 10n ** BigInt(18 - decimals);
    }, 0n);
  }

  /** Bounded distinct-on load: inception + latest price at each yield cap ≤ `asOf`. */
  static async loadTokenSnapshotHistoryForYields(
    context: Context | ReadOnlyContext,
    tokenIds: readonly `0x${string}`[],
    asOf: Date
  ): Promise<Map<`0x${string}`, TokenSnapshotPricePoint[]>> {
    const result = new Map<`0x${string}`, TokenSnapshotPricePoint[]>();
    if (tokenIds.length === 0) return result;
    const uniqueIds = [...new Set(tokenIds)] as `0x${string}`[];
    const caps = yieldSnapshotCapTimes(asOf);
    serviceLog(
      "loadTokenSnapshotHistoryForYields",
      expandInlineObject({ tokenCount: uniqueIds.length, capCount: caps.length + 1 })
    );
    const db = "sql" in context.db ? context.db.sql : context.db;
    const idFilter = inArray(TokenSnapshot.id, uniqueIds);
    const positivePrice = and(
      isNotNull(TokenSnapshot.tokenPrice),
      gt(TokenSnapshot.tokenPrice, 0n)
    );
    const yieldFields = {
      id: TokenSnapshot.id,
      timestamp: TokenSnapshot.timestamp,
      tokenPrice: TokenSnapshot.tokenPrice,
      blockNumber: TokenSnapshot.blockNumber,
    };

    const rowToPoint = (row: {
      timestamp: Date;
      tokenPrice: bigint | null;
      blockNumber: number;
    }): TokenSnapshotPricePoint => ({
      timestamp: row.timestamp,
      tokenPrice: row.tokenPrice,
      blockNumber: row.blockNumber,
    });

    const inceptionRows = await db
      .selectDistinctOn([TokenSnapshot.id], yieldFields)
      .from(TokenSnapshot)
      .where(and(idFilter, lte(TokenSnapshot.timestamp, asOf), positivePrice))
      .orderBy(
        asc(TokenSnapshot.id),
        asc(TokenSnapshot.timestamp),
        asc(TokenSnapshot.blockNumber),
        asc(TokenSnapshot.trigger)
      );

    const capQueries = caps.map((cap) =>
      db
        .selectDistinctOn([TokenSnapshot.id], yieldFields)
        .from(TokenSnapshot)
        .where(
          and(
            idFilter,
            lte(TokenSnapshot.timestamp, cap),
            lte(TokenSnapshot.timestamp, asOf),
            positivePrice
          )
        )
        .orderBy(
          asc(TokenSnapshot.id),
          desc(TokenSnapshot.timestamp),
          desc(TokenSnapshot.blockNumber),
          desc(TokenSnapshot.trigger)
        )
    );

    const capRowSets = await Promise.all(capQueries);

    const byId = new Map<`0x${string}`, Map<string, TokenSnapshotPricePoint>>();
    const addRow = (id: `0x${string}`, point: TokenSnapshotPricePoint) => {
      let m = byId.get(id);
      if (!m) {
        m = new Map();
        byId.set(id, m);
      }
      m.set(yieldSnapshotPointKey(point), point);
    };

    for (const row of inceptionRows) {
      addRow(row.id as `0x${string}`, rowToPoint(row));
    }
    for (const rowset of capRowSets) {
      for (const row of rowset) {
        addRow(row.id as `0x${string}`, rowToPoint(row));
      }
    }

    for (const id of uniqueIds) {
      const m = byId.get(id);
      const arr = m ? sortTokenYieldPricePoints([...m.values()]) : [];
      result.set(id, arr);
    }
    return result;
  }

  /** Yield fields for one snapshot row (`tokenPrice` + `timestamp` as end/as-of). */
  static async computeSnapshotYieldFields(
    context: Context | ReadOnlyContext,
    tokenId: `0x${string}`,
    snapshotTokenPrice: bigint | null,
    snapshotAsOf: Date
  ): Promise<Record<string, bigint | null>> {
    const history = await this.loadTokenSnapshotHistoryForYields(context, [tokenId], snapshotAsOf);
    const sorted = sortTokenYieldPricePoints(history.get(tokenId) ?? []);
    return sanitizeTokenYieldSnapshotFields(
      computeTokenYieldSnapshotFields(snapshotTokenPrice, snapshotAsOf, sorted)
    );
  }

  /** Batch-recompute yields for snapshots at/after `fromTimestamp` with positive `tokenPrice`. */
  static async recalculateTokenSnapshotYieldsFromTimestamp(
    context: Context,
    event: Event,
    tokenId: `0x${string}`,
    fromTimestamp: Date
  ): Promise<void> {
    const snapshots = (await TokenSnapshotRows.query(context, {
      id: tokenId,
      timestamp_gte: fromTimestamp,
      tokenPrice_gt: 0n,
      _sort: [{ field: "timestamp", direction: "asc" }],
    })) as InstanceType<typeof TokenSnapshotRows>[];
    if (snapshots.length === 0) {
      serviceLog(
        "TokenService.recalculateTokenSnapshotYieldsFromTimestamp",
        expandInlineObject({ tokenId, count: 0 })
      );
      return;
    }
    serviceLog(
      "TokenService.recalculateTokenSnapshotYieldsFromTimestamp",
      expandInlineObject({ tokenId, fromTs: fromTimestamp.getTime(), count: snapshots.length })
    );
    const instances = await Promise.all(
      snapshots.map(async (snap) => {
        const row = snap.read();
        const yields = await TokenService.computeSnapshotYieldFields(
          context,
          tokenId,
          row.tokenPrice,
          row.timestamp
        );
        const yieldPatch: TokenYieldSnapshotFields = {};
        for (const col of ALL_TOKEN_YIELD_SNAPSHOT_COLUMN_NAMES) {
          yieldPatch[col] = yields[col] ?? null;
        }
        const merged = { ...row, ...yieldPatch };
        return new TokenSnapshotRows(TokenSnapshot, "TokenSnapshot", context, merged);
      })
    );
    await TokenSnapshotRows.saveMany(context, instances, event);
  }

  /** Yields from preloaded history; does not write `token` table. */
  static computeYieldsBatch(
    tokens: TokenService[],
    asOf: Date,
    historyByTokenId: Map<`0x${string}`, TokenSnapshotPricePoint[]>
  ): Map<`0x${string}`, Record<string, bigint | null>> {
    serviceLog("computeYieldsBatch", expandInlineObject({ count: tokens.length }));
    const out = new Map<`0x${string}`, Record<string, bigint | null>>();
    for (const token of tokens) {
      const id = token.read().id;
      const raw = historyByTokenId.get(id) ?? [];
      const sorted = sortTokenYieldPricePoints(raw);
      const { tokenPrice } = token.read();
      out.set(
        id,
        sanitizeTokenYieldSnapshotFields(computeTokenYieldSnapshotFields(tokenPrice, asOf, sorted))
      );
    }
    return out;
  }
}

/** Internal: `token_snapshot` query/saveMany only. */
class TokenSnapshotRows extends Service<typeof TokenSnapshot> {
  static readonly entityTable = TokenSnapshot;
  static readonly entityName = "TokenSnapshot";
}
