import type { Context } from "ponder:registry";
import { Vault } from "ponder:schema";
import { Service } from "./Service";

export class VaultService extends Service<typeof Vault> {
  protected readonly table = Vault;

  static async init(context: Context, data: typeof Vault.$inferInsert) {
    const vault = (await context.db.sql.insert(Vault).values(data).returning()).pop();
    if (!vault) throw new Error(`Vault with ${data} not inserted`);
    return new this(context, vault);
  }

  static async get(context: Context, query: typeof Vault.$inferInsert) {
    const vault = await context.db.find(Vault, query);
    if (!vault) throw new Error(`Vault with ${query} not found`);
    return new this(context, vault);
  }

  static async getOrInit(context: Context, query: typeof Vault.$inferInsert) {
    let vault =  await context.db.find(Vault, query);
    if (!vault) {
      console.info("Initialising vault: ", query);
      vault = (await context.db.sql.insert(Vault).values(query).returning()).pop() ?? null;
    }
    if (!vault) throw new Error(`Vault with ${query} not found`);
    return new this(context, vault);
  }
  
  
}