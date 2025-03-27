import type { Context } from "ponder:registry";
import { Epoch } from "ponder:schema";
import { Service } from "./Service";

export class EpochService extends Service<typeof Epoch> {
  protected readonly table = Epoch;

  static async init(context: Context, data: typeof Epoch.$inferInsert) {
    console.info("Initialising epoch", data);
    return new this(context, await context.db.insert(Epoch).values(data));
  }

  static async get(context: Context, query: typeof Epoch.$inferSelect) {
    const epoch = await context.db.find(Epoch, query);
    if (!epoch) {
      throw new Error(`Epoch with id ${query.poolId} and epochId ${query.epochId} not found`);
    }
    return new this(context, epoch);
  }
}
