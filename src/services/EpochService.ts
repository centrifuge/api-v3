import type { Context, Event } from "ponder:registry";
import { Epoch } from "ponder:schema";
import { Service } from "./Service";
import { eq, and } from "drizzle-orm";

export class EpochService extends Service<typeof Epoch> {
  protected readonly table = Epoch;

  static async init(context: Context, data: typeof Epoch.$inferInsert) {
    console.info("Initialising epoch", data);
    const insert =
      (await context.db.sql.insert(Epoch).values(data).returning()).pop() ??
      null;
    if (!insert) throw new Error(`Epoch with ${data} not inserted`);
    return new this(context, insert);
  }

  static async get(context: Context, query: typeof Epoch.$inferInsert) {
    const epoch = await context.db.find(Epoch, query);
    if (!epoch) {
      throw new Error(`Epoch with ${query} not found`);
    }
    return new this(context, epoch);
  }

  async save() {
    const update =
      (
        await this.db.sql
          .update(this.table)
          .set({ ...this.data, index: undefined, poolId: undefined })
          .where(
            and(
              eq(this.table.index, this.data.index),
              eq(this.table.poolId, this.data.poolId)
            )
          )
          .returning()
      ).pop() ?? null;
    if (!update) throw new Error(`Failed to update ${this.table}`);
    this.data = update;
    return this;
  }

  close(context: Context, block: Event["block"]) {
    console.info(
      `Closing epoch ${this.data.poolId} ${this.data.index} at block ${block.number}`
    );
    this.data.closedAtBlock = Number(block.number);
    this.data.closedAt = new Date(Number(block.timestamp) * 1000);
    return this;
  }
}
