import type { Context } from "ponder:registry";
import { ShareClass } from "ponder:schema";
import { Service } from "./Service";

export class ShareClassService extends Service<typeof ShareClass> {
  protected readonly table = ShareClass;

  static async init(context: Context, data: typeof ShareClass.$inferInsert) {
    console.info("Initialising shareClass", data);
    return new this(context, await context.db.insert(ShareClass).values(data));
  }

  static async get(context: Context, query: typeof ShareClass.$inferSelect) {
    const shareClass = await context.db.find(ShareClass, query);
    if (!shareClass) {
      throw new Error(`ShareClass with ${query} not found`);
    }
    return new this(context, shareClass);
  }
}
