import type { Context, Event } from "ponder:registry";
import schema from "ponder:schema";
import {
  eq,
  and,
  count,
  isNull,
  isNotNull,
  not,
  asc,
  desc,
  inArray,
  lte,
  gte,
  lt,
  gt,
} from "drizzle-orm";
import { getTableConfig, type PgTableWithColumns } from "drizzle-orm/pg-core";
import {
  expandInlineObject,
  serviceLog,
  serviceError,
} from "../helpers/logger";
import { toCamelCase } from "drizzle-orm/casing";
import { ReadonlyDrizzle } from "ponder";
import { timestamper } from "../helpers/timestamper";

/** Type alias for PostgreSQL table with columns */
type OnchainTable = PgTableWithColumns<any>;
export type ReadOnlyContext = { db: ReadonlyDrizzle<typeof schema> };

type CreationProps<T extends OnchainTable> = {
  [K in keyof T]: K extends `${string}CreatedAt` ? T[K] : never;
}[keyof T];
type UpdateProps<T extends OnchainTable> = {
  [K in keyof T]: K extends `${string}UpdatedAt` ? T[K] : never;
}[keyof T];
type DataWithoutDefaults<T extends OnchainTable> = Omit<
  T["$inferInsert"],
  keyof (CreationProps<T> & UpdateProps<T>)
>;

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
  protected readonly db: Context["db"]["sql"] | ReadOnlyContext["db"];
  /** Client context for additional operations */
  protected readonly client: Context["client"] | null;
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
    context: Context | ReadOnlyContext,
    data: T["$inferSelect"]
  ) {
    this.db = "sql" in context.db ? context.db.sql : context.db;
    this.client = "client" in context ? context.client : null;
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
  public async save(event: Event | null) {
    if (!("insert" in this.db)) throw new Error(`Read only database`);
    const dataWithDefaults = event
      ? updateDefaults(this.table, this.data, event)
      : { ...this.data };
    serviceLog(`Saving ${this.name}`, expandInlineObject(dataWithDefaults));
    const upsert =
      (
        await this.db
          .insert(this.table)
          .values(dataWithDefaults)
          .onConflictDoUpdate({
            target: getPrimaryKeysFieldNames(this.table).map(
              (key) => this.table[key]
            ),
            set: { ...dataWithDefaults, ...timestamper("created", undefined) },
          })
          .returning()
      ).pop() ?? null;
    if (!upsert) throw new Error(`Failed to save ${this.name}`);
    this.data = upsert;
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
    if (!("delete" in this.db)) throw new Error(`Read only database`);
    serviceLog(`Deleting ${this.name}`, expandInlineObject(this.data));
    if (!this.data) throw new Error(`No data to delete for ${this.table}`);
    await this.db
      .delete(this.table)
      .where(primaryKeyFilter(this.table, this.data));
    return this;
  }
}

/** Type alias for constructor functions */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<I> = new (..._args: any[]) => I;

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
    static async insert(
      context: Context,
      data: T["$inferInsert"],
      event: null
    ): Promise<InstanceType<C> | null>;
    static async insert(
      context: Context,
      data: DataWithoutDefaults<T>,
      event: Event
    ): Promise<InstanceType<C> | null>;
    static async insert(
      context: Context,
      data: DataWithoutDefaults<T> | T["$inferInsert"],
      event: Event | null
    ) {
      const dataWithDefaults = event
        ? insertDefaults(table, data, event)
        : { ...data };
      const [insert] = await context.db.sql
        .insert(table as OnchainTable)
        .values(dataWithDefaults)
        .onConflictDoNothing()
        .returning();
      serviceLog(`Inserting ${name}`, expandInlineObject(dataWithDefaults));
      if (!insert) return null;
      return new this(table, name, context, insert) as InstanceType<C>;
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
      context: Context | ReadOnlyContext,
      query: Partial<ExtendedQuery<T["$inferInsert"]>>
    ) {
      const db = "sql" in context.db ? context.db.sql : context.db;
      serviceLog("get", name, expandInlineObject(query));
      const [entity] = await db
        .select()
        .from(table as OnchainTable)
        .where(queryToFilter(table, query))
        .limit(1);
      if (!entity) return null;
      serviceLog(`Found ${name}: `, expandInlineObject(entity));
      return new this(table, name, context, entity);
    }

    /**
     * Finds an existing record or creates a new one if it doesn't exist.
     *
     * @param context - Database and client context
     * @param query - Query criteria to find or create the record
     * @param onInit - Function to execute when the record is not found
     * @param deferInsert - Whether to defer the insert operation for further processing of the entity
     * @returns Promise that resolves to a service instance
     * @throws {Error} When the create operation fails
     */
    static async getOrInit(
      context: Context,
      query: DataWithoutDefaults<T>,
      event: Event,
      onInit?: (entity: T["$inferSelect"]) => Promise<void>,
      deferInsert?: boolean
    ): Promise<InstanceType<C>>;
    static async getOrInit(
      context: Context,
      query: T["$inferInsert"],
      event: null,
      onInit?: (entity: T["$inferSelect"]) => Promise<void>,
      deferInsert?: boolean
    ): Promise<InstanceType<C>>;
    static async getOrInit(
      context: Context,
      query: DataWithoutDefaults<T> | T["$inferInsert"],
      event: Event | null,
      onInit?: (entity: T["$inferSelect"]) => Promise<void>,
      deferInsert?: boolean
    ): Promise<InstanceType<C>> {
      const dataWithDefaults = event
        ? insertDefaults(table, query, event)
        : { ...query };
      serviceLog("getOrInit", name, expandInlineObject(dataWithDefaults));
      let entity = await context.db.find(table as any, dataWithDefaults);
      serviceLog(`Found ${name}: `, expandInlineObject(entity));
      if (!entity) {
        if (onInit) {
          serviceLog(`Executing onInit for ${name}`);
          await onInit(dataWithDefaults);
        }
        if (deferInsert) {
          serviceLog(`Deferring insert for ${name}`);
          return new this(
            table,
            name,
            context,
            dataWithDefaults
          ) as InstanceType<C>;
        }
        serviceLog(
          `Initialising ${name}: `,
          expandInlineObject(dataWithDefaults)
        );
        const [insert] = await context.db.sql
          .insert(table as OnchainTable)
          .values(dataWithDefaults)
          .onConflictDoNothing()
          .returning();
        entity = insert ?? null;
        if (!entity)
          throw new Error(
            `Failed to initialise ${name}: ${expandInlineObject(query)}`
          );
      }
      return new this(table, name, context, entity) as InstanceType<C>;
    }

    /**
     * Updates an existing record or creates a new one if it doesn't exist.
     *
     * @param context - Database and client context
     * @param query - Query criteria to find or create the record
     * @returns Promise that resolves to a service instance
     * @throws {Error} When the upsert operation fails
     */
    static async upsert(
      context: Context,
      query: T["$inferInsert"],
      event: null
    ): Promise<InstanceType<C> | null>;
    static async upsert(
      context: Context,
      query: DataWithoutDefaults<T>,
      event: Event
    ): Promise<InstanceType<C> | null>;
    static async upsert(
      context: Context,
      query: DataWithoutDefaults<T> | T["$inferInsert"],
      event: Event | null
    ): Promise<InstanceType<C> | null> {
      const dataWithDefaults = event
        ? insertDefaults(table, query, event)
        : { ...query };
      serviceLog("upsert", name, expandInlineObject(dataWithDefaults));
      const [entity] = await context.db.sql
        .insert(table as OnchainTable)
        .values(dataWithDefaults)
        .onConflictDoUpdate({
          target: getPrimaryKeysFieldNames(table).map((key) => table[key]),
          set: {
            ...dataWithDefaults,
            createdAt: undefined,
            createdAtBlock: undefined,
            createdAtTxHash: undefined,
          },
        })
        .returning();

      if (!entity) {
        serviceError(`Failed to upsert ${name}: ${expandInlineObject(query)}`);
        return null;
      }
      return new this(table, name, context, entity) as InstanceType<C>;
    }

    /**
     * Queries the database for multiple records matching the criteria.
     *
     * @param context - Database and client context
     * @param query - Query criteria to filter records
     * @returns Promise that resolves to an array of service instances
     */
    static async query(
      context: Context | ReadOnlyContext,
      query: Partial<ExtendedQuery<T["$inferSelect"]>>
    ) {
      const db = "sql" in context.db ? context.db.sql : context.db;
      serviceLog(`Querying ${name}`, expandInlineObject(query));
      const filter = queryToFilter(table, query);
      let q = db
        .select()
        .from(table as OnchainTable)
        .$dynamic();
      if (filter) q = q.where(filter);
      if (query._sort && query._sort.length > 0)
        q = q.orderBy(
          ...query._sort.map(
            (sort: { field: keyof T; direction: "asc" | "desc" }) => {
              const column = table[sort.field];
              return sort.direction === "asc" ? asc(column) : desc(column);
            }
          )
        );
      const results = await q;
      serviceLog(`Found ${results.length} ${name}`);
      return results.map((result) => new this(table, name, context, result));
    }

    /**
     * Counts the number of records matching the query criteria.
     *
     * @param context - Database and client context
     * @param query - Query criteria to filter records
     * @returns Promise that resolves to the count of matching records
     */
    static async count(
      context: Context | ReadOnlyContext,
      query: Partial<ExtendedQuery<T["$inferSelect"]>>
    ) {
      const db = "sql" in context.db ? context.db.sql : context.db;
      const filter = queryToFilter(table, query);
      let q = db
        .select({ count: count() })
        .from(table as OnchainTable)
        .$dynamic();
      if (filter) q = q.where(filter);
      const [result] = await q;
      return result?.count ?? 0;
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
export function getPrimaryKeysFieldNames<T extends OnchainTable>(table: T) {
  const config = getTableConfig(table);
  const { primaryKeys, columns } = config;
  const directPkNames = columns
    .filter((column) => column.primary)
    .map((column) => toCamelCase(column.name));
  const compositePkNames = primaryKeys.flatMap((pk) =>
    pk.columns.map((col) => toCamelCase(col.name))
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
export function getPrimaryKeysFields<T extends OnchainTable>(
  table: T,
  data: T["$inferSelect"]
) {
  const primaryKeys = getPrimaryKeysFieldNames(table);
  const pkFields = pick(data, ...primaryKeys);
  return pkFields;
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
export function primaryKeyFilter<T extends OnchainTable>(
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

// Optimized: Consolidated into fewer intersections to reduce type computation
type ExtendedQuery<T> = {
  [P in keyof T]: T[P];
} & {
  [P in keyof T as `${string & P}_not`]: T[P];
} & {
  [P in keyof T as `${string & P}_in`]: T[P][];
} & {
  [P in keyof T as `${string & P}_lte`]: T[P];
} & {
  [P in keyof T as `${string & P}_lt`]: T[P];
} & {
  [P in keyof T as `${string & P}_gte`]: T[P];
} & {
  [P in keyof T as `${string & P}_gt`]: T[P];
} & {
  _sort?: Array<{
    field: keyof T;
    direction: "asc" | "desc";
  }>;
};

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
  query: Partial<ExtendedQuery<T["$inferInsert"]>>
) {
  const queryEntries = Object.entries(query).filter(
    ([key]) => !key.startsWith("_")
  );
  const queries = queryEntries.map(([column, value]) => {
    if (value === null) {
      if (column.endsWith("_not"))
        return isNotNull(table[column.slice(0, -4) as keyof T]);
      return isNull(table[column as keyof T]);
    }
    if (column.endsWith("_not"))
      return not(eq(table[column.slice(0, -4) as keyof T], value));
    if (column.endsWith("_in"))
      return inArray(table[column.slice(0, -3) as keyof T], value);
    if (column.endsWith("_lte"))
      return lte(table[column.slice(0, -4) as keyof T], value);
    if (column.endsWith("_lt"))
      return lt(table[column.slice(0, -3) as keyof T], value);
    if (column.endsWith("_gte"))
      return gte(table[column.slice(0, -4) as keyof T], value);
    if (column.endsWith("_gt"))
      return gt(table[column.slice(0, -3) as keyof T], value);
    return eq(table[column as keyof T], value);
  });
  if (queries.length > 1) {
    return and(...queries);
  } else {
    return queries[0];
  }
}

/**
 * Sets the default values for the data object based on the block for insert.
 *
 * @template T - The PostgreSQL table type
 * @param data - The data object to set the defaults for
 * @param block - The block to set the defaults for
 * @returns The data object with the defaults set
 */
function insertDefaults<T extends OnchainTable>(
  table: T,
  data: DataWithoutDefaults<T>,
  event: Event
): T["$inferInsert"] {
  const dataWithDefaults = { ...data } as T["$inferInsert"] &
    CreationProps<T> &
    UpdateProps<T>;
  if ("createdAt" in table)
    dataWithDefaults.createdAt = new Date(Number(event.block.timestamp) * 1000);
  if ("createdAtBlock" in table)
    dataWithDefaults.createdAtBlock = Number(event.block.number);
  if ("createdAtTxHash" in table && "transaction" in event)
    dataWithDefaults.createdAtTxHash = event.transaction.hash as `0x${string}`;
  if ("updatedAt" in table)
    dataWithDefaults.updatedAt = new Date(Number(event.block.timestamp) * 1000);
  if ("updatedAtBlock" in table)
    dataWithDefaults.updatedAtBlock = Number(event.block.number);
  if ("updatedAtTxHash" in table && "transaction" in event)
    dataWithDefaults.updatedAtTxHash = event.transaction.hash as `0x${string}`;
  return dataWithDefaults;
}

/**
 * Updates the default values for the data object based on the block.
 *
 * @template T - The PostgreSQL table type
 * @param data - The data object to update the defaults for
 * @param block - The block to update the defaults for
 * @returns The data object with the defaults updated
 */
function updateDefaults<T extends OnchainTable>(
  table: T,
  data: T["$inferSelect"],
  event: Event
): T["$inferSelect"] & UpdateProps<T> {
  const dataWithDefaults = { ...data } as T["$inferSelect"] & UpdateProps<T>;
  if ("updatedAt" in table)
    dataWithDefaults.updatedAt = new Date(Number(event.block.timestamp) * 1000);
  if ("updatedAtBlock" in table)
    dataWithDefaults.updatedAtBlock = Number(event.block.number);
  if ("updatedAtTxHash" in table && "transaction" in event)
    dataWithDefaults.updatedAtTxHash = event.transaction.hash as `0x${string}`;
  return dataWithDefaults;
}
