import type { Context } from "ponder:registry";
import type { PgTable } from "drizzle-orm/pg-core";

export abstract class Service<T extends PgTable> {
  static readonly table: PgTable;
  //static init: <T extends PgTable, S extends Service<T>>(context: Context, data: T["$inferInsert"]) => Promise<S>;
  //static get: <AT extends PgTable, U extends AT, S extends Service<U>>(context: Context, query: U["$inferSelect"]) => Promise<S>;
  protected abstract readonly table: T;
  protected readonly db: Context["db"];
  protected readonly client: Context["client"];
  protected data: T["$inferSelect"];

  constructor(context: Context, data: T["$inferSelect"]) {
    this.db = context.db;
    this.client = context.client;
    this.data = data;
  }

  public read() {
    return { ...this.data };
  }

  async save() {
    const update = (await this.db.sql.update(this.table).set(this.data).returning()).pop() ?? null;
    if (!update) throw new Error(`Failed to update ${this.table}`);
    this.data = update;
    return this;
  }
}


