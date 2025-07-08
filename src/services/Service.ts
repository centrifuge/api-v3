import type { Context } from "ponder:registry";
import { eq, and } from "drizzle-orm";

import { getTableConfig, PgTableWithColumns } from "drizzle-orm/pg-core";

/** Type alias for PostgreSQL table with columns */
type OnchainTable = PgTableWithColumns<any>;

/**
 * Generic service class for managing database operations on PostgreSQL tables.
 * Provides CRUD operations and database interaction utilities.
 * 
 * @template T - The PostgreSQL table type extending OnchainTable
 */
export class Service<T extends OnchainTable> {
  /** The database table instance */
  protected readonly table: T;
  /** Human-readable name for the service entity */
  protected readonly name: string;
  /** Database context for SQL operations */
  protected readonly db: Context["db"];
  /** Client context for additional operations */
  protected readonly client: Context["client"];
  /** Current data instance of the table row */
  protected data: T["$inferSelect"];

  /**
   * Creates a new Service instance.
   * 
   * @param table - The PostgreSQL table to operate on
   * @param name - Human-readable name for the service entity
   * @param context - Database and client context
   * @param data - Initial data for the service instance
   */
  constructor(
    table: T,
    name: string,
    context: Context,
    data: T["$inferInsert"]
  ) {
    this.db = context.db;
    this.client = context.client;
    this.table = table;
    this.name = name;
    this.data = data;
  }

  /**
   * Returns a copy of the current data.
   * 
   * @returns A shallow copy of the current data object
   */
  public read() {
    return { ...this.data };
  }

  /**
   * Updates the database record with the current data.
   * Uses primary key filtering to identify the record to update.
   * 
   * @returns Promise that resolves to the service instance after successful update
   * @throws {Error} When the update operation fails
   */
  public async save() {
    console.info(`Saving ${this.name}`, this.data);
    const pkFilter = primaryKeyFilter(this.table, this.data);
    const update =
      (
        await this.db.sql
          .update(this.table)
          .set(this.data)
          .where(pkFilter)
          .returning()
      ).pop() ?? null;
    if (!update) throw new Error(`Failed to update ${this.name}`);
    this.data = update;
    return this;
  }

  /**
   * Deletes the current record from the database.
   * Uses primary key filtering to identify the record to delete.
   * 
   * @returns Promise that resolves to the service instance after successful deletion
   * @throws {Error} When there's no data to delete or deletion fails
   */
  public async delete() {
    if (!this.data) throw new Error(`No data to delete for ${this.table}`);
    await this.db.sql
      .delete(this.table)
      .where(primaryKeyFilter(this.table, this.data));
    return this;
  }
}

/** Type alias for constructor functions */
type Constructor<I> = new (...args: any[]) => I;

/**
 * Mixin function that adds common static methods to a service class.
 * Provides factory methods for creating, finding, and querying service instances.
 * 
 * @template C - The constructor type of the service class
 * @template I - The instance type of the service class
 * @template T - The PostgreSQL table type
 * @param service - The service class constructor to extend
 * @param table - The PostgreSQL table to operate on
 * @param name - Human-readable name for the service entity
 * @returns A new class extending the original service with static methods
 */
export function mixinCommonStatics<
  C extends Constructor<I>,
  I extends Service<T>,
  T extends OnchainTable
>(service: C, table: T, name: string) {
  return class extends service {
    /**
     * Creates a new record in the database and returns a service instance.
     * 
     * @param context - Database and client context
     * @param data - Data to insert into the database
     * @returns Promise that resolves to a new service instance
     * @throws {Error} When the insert operation fails
     */
    static async init(context: Context, data: T["$inferInsert"]) {
      console.info(`Initialising ${name}`, data);
      const insert =
        (await context.db.sql.insert(table).values(data).returning()).pop() ??
        null;
      if (!insert) throw new Error(`${name} with ${data} not inserted`);
      return new this(table, name, context, insert);
    }

    /**
     * Finds an existing record in the database by query criteria.
     * 
     * @param context - Database and client context
     * @param query - Query criteria to find the record
     * @returns Promise that resolves to a service instance for the found record
     * @throws {Error} When no record matches the query criteria
     */
    static async get(
      context: Context,
      query: Partial<NonNullable<T["$inferInsert"]>>
    ) {
      console.log("get", name, query);
      const entity = await context.db.find(table as any, query);
      console.log(`Found ${name}: `, entity);
      if (!entity) {
        throw new Error(`${name} with ${JSON.stringify(query)} not found`);
      }
      return new this(table, name, context, entity);
    }

    /**
     * Finds an existing record or creates a new one if it doesn't exist.
     * 
     * @param context - Database and client context
     * @param query - Query criteria to find or create the record
     * @returns Promise that resolves to a service instance
     * @throws {Error} When the create operation fails
     */
    static async getOrInit(context: Context, query: T["$inferInsert"]) {
      console.log("getOrInit", name, query);
      let entity = await context.db.find(table as any, query);
      console.log(`Found ${name}: `, entity);
      if (!entity) {
        console.info(`Initialising ${name}: `, query);
        entity =
          (
            await context.db.sql.insert(table).values(query).returning()
          ).pop() ?? null;
        if (!entity) throw new Error(`Failed to initialise ${name}: ${query}`);
      }
      return new this(table, name, context, entity);
    }

    /**
     * Queries the database for multiple records matching the criteria.
     * 
     * @param context - Database and client context
     * @param query - Query criteria to filter records
     * @returns Promise that resolves to an array of service instances
     */
    static async query(context: Context, query: Partial<T["$inferSelect"]>) {
      console.info(`Querying ${name}`, query);
      const filter = queryToFilter(table, query);
      const results = await context.db.sql
        .select()
        .from(table as OnchainTable)
        .where(filter);
      console.info(`Found ${results.length} ${name}`);
      return results.map((result) => new this(table, name, context, result));
    }
  };
}

/**
 * Extracts the names of primary key fields from a table configuration.
 * Handles both direct primary keys and composite primary keys.
 * 
 * @template T - The PostgreSQL table type
 * @param table - The table to extract primary key names from
 * @returns Array of primary key field names
 */
function getPrimaryKeysFieldNames<T extends OnchainTable>(table: T) {
  const config = getTableConfig(table);
  const { primaryKeys, columns } = config;
  const directPkNames = columns
    .filter((column) => column.primary)
    .map((column) => column.name);
  const compositePkNames = primaryKeys.flatMap((pk) =>
    pk.columns.map((col) => col.name)
  );
  const primaryKeysFieldNames = [...directPkNames, ...compositePkNames];
  return primaryKeysFieldNames as (keyof T["$inferSelect"])[];
}

/**
 * Extracts primary key field values from a data object.
 * 
 * @template T - The PostgreSQL table type
 * @param table - The table to get primary key configuration from
 * @param data - The data object to extract primary key values from
 * @returns Object containing only the primary key fields and their values
 */
function getPrimaryKeysFields<T extends OnchainTable>(
  table: T,
  data: T["$inferSelect"]
) {
  const primaryKeys = getPrimaryKeysFieldNames(table);
  return pick(data, ...primaryKeys);
}

/**
 * Creates a new object with only the specified properties from the input object.
 * 
 * @template T - The type of the input object
 * @template K - The type of the keys to pick
 * @param obj - The source object
 * @param props - The properties to pick from the object
 * @returns A new object containing only the specified properties
 */
function pick<T, K extends keyof T>(obj: T, ...props: K[]): Pick<T, K> {
  return props.reduce(function (result, prop) {
    result[prop] = obj[prop];
    return result;
  }, {} as Pick<T, K>);
}

/**
 * Creates a Drizzle ORM filter condition based on primary key values.
 * Handles both single and composite primary keys.
 * 
 * @template T - The PostgreSQL table type
 * @param table - The table to create the filter for
 * @param data - The data object containing primary key values
 * @returns Drizzle ORM filter condition for primary key matching
 * @throws {Error} When no primary keys are found for the table
 */
function primaryKeyFilter<T extends OnchainTable>(
  table: T,
  data: T["$inferSelect"]
) {
  const primaryKeys = Object.entries(getPrimaryKeysFields(table, data));
  if (primaryKeys.length === 0) throw new Error(`No primary keys for ${table}`);
  if (primaryKeys.length === 1) {
    return eq(table[primaryKeys[0]![0] as keyof T], primaryKeys[0]![1]);
  } else {
    return and(
      ...primaryKeys.map(([columnName, columnValue]) =>
        eq(table[columnName as keyof T], columnValue)
      )
    );
  }
}

/**
 * Converts a query object into a Drizzle ORM filter condition.
 * Creates equality conditions for each property in the query object.
 * 
 * @template T - The PostgreSQL table type
 * @param table - The table to create the filter for
 * @param query - The query object containing field-value pairs
 * @returns Drizzle ORM filter condition combining all query conditions
 */
function queryToFilter<T extends OnchainTable>(
  table: T,
  query: Partial<T["$inferInsert"]>
) {
  const queryEntries = Object.entries(query);
  const queries = queryEntries.map(([column, value]) => {
    return eq(table[column as keyof T], value);
  });
  if (queries.length >= 1) {
    return and(...queries);
  } else {
    return queries[0];
  }
}