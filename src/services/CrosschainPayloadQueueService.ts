import { and, asc, count, eq, inArray, or } from "drizzle-orm";
import { CrosschainPayloadQueue } from "ponder:schema";
import { Context } from "ponder:registry";
import { Service, type DataWithoutDefaults } from "./Service";
import { expandInlineObject, serviceLog } from "../helpers/logger";
import type { CrosschainQueuePk } from "./CrosschainMessageQueueService";

/**
 * Staging rows for unmatched `multiAdapter:HandlePayload` / `HandleProof` receives.
 *
 * @extends {Service<typeof CrosschainPayloadQueue>}
 */
export class CrosschainPayloadQueueService extends Service<typeof CrosschainPayloadQueue> {
  static readonly entityTable = CrosschainPayloadQueue;
  static readonly entityName = "CrosschainPayloadQueue";

  /**
   * Inserts a queue row; idempotent on `(chainId, transactionHash, logIndex)`.
   * @param context - Ponder context
   * @param data - Queue row fields
   */
  static async enqueue(
    context: Context,
    data: DataWithoutDefaults<typeof CrosschainPayloadQueue>
  ): Promise<void> {
    serviceLog("CrosschainPayloadQueue insert", expandInlineObject({ payloadId: data.payloadId }));
    await context.db.sql.insert(CrosschainPayloadQueue).values(data).onConflictDoNothing();
  }

  /**
   * FIFO queue rows for the given payload ids.
   * @param context - Ponder context
   * @param payloadIds - Payload ids to load
   * @returns Rows sorted by receive time
   */
  static async queryFifoForKeys(
    context: Context,
    payloadIds: readonly `0x${string}`[]
  ): Promise<(typeof CrosschainPayloadQueue)["$inferSelect"][]> {
    const unique = [...new Set(payloadIds)];
    if (unique.length === 0) return [];
    serviceLog(
      "CrosschainPayloadQueue queryFifoForKeys",
      expandInlineObject({ count: unique.length })
    );
    return context.db.sql
      .select()
      .from(CrosschainPayloadQueue)
      .where(inArray(CrosschainPayloadQueue.payloadId, unique))
      .orderBy(
        asc(CrosschainPayloadQueue.receivedAtBlock),
        asc(CrosschainPayloadQueue.receivedAt)
      );
  }

  /**
   * Counts queue rows for the given payload ids.
   * @param context - Ponder context
   * @param payloadIds - Payload ids
   * @returns Row count
   */
  static async countForKeys(
    context: Context,
    payloadIds: readonly `0x${string}`[]
  ): Promise<number> {
    const unique = [...new Set(payloadIds)];
    if (unique.length === 0) return 0;
    const [result] = await context.db.sql
      .select({ n: count() })
      .from(CrosschainPayloadQueue)
      .where(inArray(CrosschainPayloadQueue.payloadId, unique));
    return Number(result?.n ?? 0);
  }

  /**
   * Deletes queue rows by primary key.
   * @param context - Ponder context
   * @param pks - Row primary keys
   */
  static async deleteMany(context: Context, pks: readonly CrosschainQueuePk[]): Promise<void> {
    if (pks.length === 0) return;
    serviceLog("CrosschainPayloadQueue deleteMany", expandInlineObject({ count: pks.length }));
    const conditions = pks.map((pk) =>
      and(
        eq(CrosschainPayloadQueue.chainId, pk.chainId),
        eq(CrosschainPayloadQueue.transactionHash, pk.transactionHash),
        eq(CrosschainPayloadQueue.logIndex, pk.logIndex)
      )
    );
    await context.db.sql
      .delete(CrosschainPayloadQueue)
      .where(conditions.length === 1 ? conditions[0]! : or(...conditions));
  }
}
