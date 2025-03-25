import type { Context } from "ponder:registry";
import { shareClasses } from "ponder:schema";
import { MultiShareClassAbi } from "../../abis/MultiShareClassAbi";
export class ShareClassService {
  private readonly db: Context["db"];
  private readonly client: Context["client"];

  public data: typeof shareClasses.$inferSelect;



  constructor(context: Context, data: typeof shareClasses.$inferSelect) {
    this.db = context.db;
    this.client = context.client;
    this.data = data;
  }

  static async create(context: Context, data: typeof shareClasses.$inferInsert) {
    return new this(context, await context.db.insert(shareClasses).values(data));
  }
}
