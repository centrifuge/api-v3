import type { Context } from "ponder:registry";
import { ShareClass } from "ponder:schema";
import { Service } from "./Service";


export class ShareClassService extends Service<typeof ShareClass> {
  protected readonly table = ShareClass;

  static async init(context: Context, data: typeof ShareClass.$inferInsert) {
    console.info("Initialising shareClass", data);
    const insert =  (await context.db.sql.insert(ShareClass).values(data).returning()).pop();
    if (!insert) throw new Error(`ShareClass with ${data} not inserted`);
    return new this(context, insert);
  }

  static async get(context: Context, query: typeof ShareClass.$inferInsert) {
    const shareClass = await context.db.find(ShareClass, query);
    if (!shareClass) throw new Error(`ShareClass with ${query} not found`);
    return new this(context, shareClass);
  }

  static async getOrInit(context: Context, query: typeof ShareClass.$inferInsert) {
    let shareClass =  await context.db.find(ShareClass, query);
    if (!shareClass) {
      console.info(`Initialising shareClass: ${query}`);
      shareClass = (await context.db.sql.insert(ShareClass).values(query).returning()).pop() ?? null;
    }
    if (!shareClass) throw new Error(`ShareClass with ${query} not found`);
    return new this(context, shareClass);
  }

  static async query(context: Context, query: Partial<typeof ShareClass.$inferInsert>) {
    const results = await context.db.sql.query.ShareClass.findMany({
      where: (shareClass, { eq, and }) => {
        const queryEntries = Object.entries(query);
        if (queryEntries.length === 0) return undefined;
        return and(...queryEntries.map(([key, value]) => eq(shareClass[key as keyof typeof shareClass], value!)));
      },
    });
    return results.map(result => new this(context, result));
  }

  public setVault(vault: `0x${string}`) {
    console.info(`Setting vault for shareClass ${this.data.id} to ${vault}`);
    this.data.vault = vault;
    return this;
  }

  public setIndex(index: number) {
    console.info(`Setting index for shareClass ${this.data.id} to ${index}`);
    this.data.index = index;
    return this;
  }

  public setMetadata(name: string, symbol: string, salt: `0x${string}`) {
    console.info(`Setting metadata for shareClass ${this.data.id} to ${name}, ${symbol}, ${salt}`);
    this.data.name = name;
    this.data.symbol = symbol;
    this.data.salt = salt;
    return this;
  }
}
