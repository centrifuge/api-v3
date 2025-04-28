import type { Context } from "ponder:registry";
import { eq, and } from "drizzle-orm";

import { getTableConfig, PgTableWithColumns } from "drizzle-orm/pg-core";
import { onchainTable } from "ponder";

type OnchainTable = PgTableWithColumns<any>;

export class Service<T extends OnchainTable> {
  protected readonly table: T;
  protected readonly name: string;
  protected readonly db: Context["db"];
  protected readonly client: Context["client"];
  protected data: T["$inferSelect"];

  constructor(table: T, name: string, context: Context, data: T["$inferInsert"]) {
    this.db = context.db;
    this.client = context.client;
    this.table = table;
    this.name = name;
    this.data = data;
  }

  public read() {
    return { ...this.data };
  }

  public async save() {
    console.info(`Saving ${this.name}`, this.data);
    const pkFilter = primaryKeyFilter(this.table, this.data);
    const update = (await this.db.sql.update(this.table).set(this.data).where(pkFilter).returning()).pop() ?? null;
    if (!update) throw new Error(`Failed to update ${this.name}`);
    this.data = update;
    return this;
  }

  public async delete() {
    if (!this.data) throw new Error(`No data to delete for ${this.table}`);
    await this.db.sql.delete(this.table).where(primaryKeyFilter(this.table, this.data));
    return this;
  }
}

type Constructor<I> = new (...args: any[]) => I;
export function mixinCommonStatics<C extends Constructor<I>, I extends Service<T>, T extends OnchainTable>(service: C, table: T, name: string) {
    return class extends service {
      static async init(context: Context, data: T['$inferInsert']) {
        console.info(`Initialising ${name}`, data);
        const insert =
          (await context.db.sql.insert(table).values(data).returning()).pop() ??
          null;
        if (!insert) throw new Error(`${name} with ${data} not inserted`);
        return new this(table, name, context, insert);
      }

      static async get(context: Context, query: Partial<NonNullable<T['$inferInsert']>>) {
        const entity = await context.db.find(table as any, query);
        if (!entity) {
          throw new Error(`${name} with ${query} not found`);
        }
        return new this(table, name, context, entity);
      }

      static async getOrInit(context: Context, query: T['$inferInsert']) {
        let entity = await context.db.find(table as any, query);
        if (!entity) {
          console.info(`Initialising ${name}: `, query);
          entity = ( await context.db.sql
                .insert(table)
                .values(query)
                .returning()
            ).pop() ?? null;
          if (!entity) throw new Error(`Failed to initialise ${name}: ${query}`);
        }
        return new this(table, name, context, entity);
      } 

      static async query(context: Context, query: Partial<T['$inferSelect']>) {
        console.info(`Querying ${name}`, query);
        const filter = queryToFilter(table, query);
        const results = await context.db.sql.select().from(table as OnchainTable).where(filter);
        console.info(`Found ${results.length} ${name}`);
        return results.map((result) => new this(table, name, context, result));
      }
    }
}

function getPrimaryKeysFieldNames<T extends OnchainTable>(table: T) {
  const config = getTableConfig(table);
  const { primaryKeys, columns } = config;
  const directPkNames = columns.filter((column) => column.primary).map((column) => column.name);
  const compositePkNames = primaryKeys.flatMap((pk) => pk.columns.map((col) => col.name));
  const primaryKeysFieldNames = [...directPkNames, ...compositePkNames];
  return primaryKeysFieldNames as (keyof T['$inferSelect'])[];
}

function getPrimaryKeysFields<T extends OnchainTable>(table: T, data: T["$inferSelect"]) {
  const primaryKeys = getPrimaryKeysFieldNames(table);
  return pick(data, ...primaryKeys);
}

function pick<T, K extends keyof T>(obj: T, ...props: K[]): Pick<T, K> {
  return props.reduce(function (result, prop) {
    result[prop] = obj[prop];
    return result;
  }, {} as Pick<T, K>);
}

function primaryKeyFilter<T extends OnchainTable>(table: T, data: T["$inferSelect"]) {
  const primaryKeys = Object.entries(getPrimaryKeysFields(table, data))
  if (primaryKeys.length === 0) throw new Error(`No primary keys for ${table}`);
  if (primaryKeys.length === 1) {
    return eq(table[primaryKeys[0]![0] as keyof T], primaryKeys[0]![1]);
  } else {
    return and(...primaryKeys.map(([columnName, columnValue]) => eq(table[columnName as keyof T], columnValue)));
  }
}

function queryToFilter<T extends OnchainTable>(table: T, query: Partial<T['$inferInsert']>) {
  const queryEntries = Object.entries(query);
  const queries = queryEntries.map(([column, value]) => {
    return eq(table[column as keyof T], value)
  });
  if (queries.length >= 1) {
    return and(...queries);
  } else {
    return queries[0];
  }
}
