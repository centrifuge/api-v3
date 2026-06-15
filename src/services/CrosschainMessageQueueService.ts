import { and, asc, count, eq, inArray, or } from "drizzle-orm";
import { CrosschainMessageQueue } from "ponder:schema";
import { Context } from "ponder:registry";
import { Service, type DataWithoutDefaults } from "./Service";
import { expandInlineObject, serviceLog } from "../helpers/logger";

/** Primary key for a staging queue row (one EVM log). */
export type CrosschainQueuePk = {
  chainId: number;
  transactionHash: `0x${string}`;
  logIndex: number;
};

/**
 * Staging rows for unmatched `gateway:ExecuteMessage` / `gateway:FailMessage` receives.
 *
 * @extends {Service<typeof CrosschainMessageQueue>}
 */
export class CrosschainMessageQueueService extends Service<typeof CrosschainMessageQueue> {
  static readonly entityTable = CrosschainMessageQueue;
  static readonly entityName = "CrosschainMessageQueue";

  /**
   * Inserts a queue row; idempotent on `(chainId, transactionHash, logIndex)`.
   * @param context - Ponder context
   * @param data - Queue row fields
   */
  static async enqueue(
    context: Context,
    data: DataWithoutDefaults<typeof CrosschainMessageQueue>
  ): Promise<void> {
    serviceLog("CrosschainMessageQueue insert", expandInlineObject({ messageId: data.messageId }));
    await context.db.sql.insert(CrosschainMessageQueue).values(data).onConflictDoNothing();
  }

  /**
   * FIFO queue rows for the given message ids.
   * @param context - Ponder context
   * @param messageIds - Message ids to load
   * @returns Rows sorted by receive time (fail before execute at equal timestamp handled upstream)
   */
  static async queryFifoForKeys(
    context: Context,
    messageIds: readonly `0x${string}`[]
  ): Promise<(typeof CrosschainMessageQueue)["$inferSelect"][]> {
    const unique = [...new Set(messageIds)];
    if (unique.length === 0) return [];
    serviceLog(
      "CrosschainMessageQueue queryFifoForKeys",
      expandInlineObject({ count: unique.length })
    );
    return context.db.sql
      .select()
      .from(CrosschainMessageQueue)
      .where(inArray(CrosschainMessageQueue.messageId, unique))
      .orderBy(
        asc(CrosschainMessageQueue.receivedAtBlock),
        asc(CrosschainMessageQueue.receivedAt)
      );
  }

  /**
   * Counts queue rows for the given message ids.
   * @param context - Ponder context
   * @param messageIds - Message ids
   * @returns Row count
   */
  static async countForKeys(
    context: Context,
    messageIds: readonly `0x${string}`[]
  ): Promise<number> {
    const unique = [...new Set(messageIds)];
    if (unique.length === 0) return 0;
    const [result] = await context.db.sql
      .select({ n: count() })
      .from(CrosschainMessageQueue)
      .where(inArray(CrosschainMessageQueue.messageId, unique));
    return Number(result?.n ?? 0);
  }

  /**
   * Deletes queue rows by primary key.
   * @param context - Ponder context
   * @param pks - Row primary keys
   */
  static async deleteMany(context: Context, pks: readonly CrosschainQueuePk[]): Promise<void> {
    if (pks.length === 0) return;
    serviceLog("CrosschainMessageQueue deleteMany", expandInlineObject({ count: pks.length }));
    const conditions = pks.map((pk) =>
      and(
        eq(CrosschainMessageQueue.chainId, pk.chainId),
        eq(CrosschainMessageQueue.transactionHash, pk.transactionHash),
        eq(CrosschainMessageQueue.logIndex, pk.logIndex)
      )
    );
    await context.db.sql
      .delete(CrosschainMessageQueue)
      .where(conditions.length === 1 ? conditions[0]! : or(...conditions));
  }
}
