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
  sql,
  getTableColumns,
} from "drizzle-orm";
import { getTableConfig, type PgTableWithColumns } from "drizzle-orm/pg-core";
import { expandInlineObject, serviceLog, serviceError } from "../helpers/logger";
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
export type DataWithoutDefaults<T extends OnchainTable> = Omit<
  T["$inferInsert"],
  keyof (CreationProps<T> & UpdateProps<T>)
>;

/** Drizzle table type carried by a concrete service class via `static entityTable`. */
export type TableTypeOf<C> = C extends { readonly entityTable: infer Tab }
  ? Tab extends OnchainTable
    ? Tab
    : never
  : never;

/**
 * Constructor type for a concrete entity service: `Service` instance plus `entityTable` / `entityName`.
 * Static methods use `this: This` with `This extends ServiceSubclass` so callers get `InstanceType<This>`.
 *
 * Constructor args are intentionally loose (`...args: any[]`): subclass constructors take a concrete
 * `T extends OnchainTable`, which is not assignable to `(table: OnchainTable, …)` under strict function
 * typing, even though call sites always pass `this.entityTable`.
 *
 * (Cannot tie this to `Service<T>`'s type parameter `T` — TypeScript disallows static members from
 * referencing the class generic.)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServiceSubclass = (new (...args: any[]) => Service<OnchainTable>) & {
  readonly entityTable: OnchainTable;
  readonly entityName: string;
};

/**
 * Generic service class for managing database operations on PostgreSQL tables.
 * Provides CRUD operations and database interaction utilities.
 *
 * Each concrete subclass must declare `static readonly entityTable` and `entityName`.
 *
 * @template T - The PostgreSQL table type extending OnchainTable
 */
export abstract class Service<T extends OnchainTable> {
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
  constructor(table: T, name: string, context: Context | ReadOnlyContext, data: T["$inferSelect"]) {
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
            target: getPrimaryKeysFieldNames(this.table).map((key) => this.table[key]),
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
    await this.db.delete(this.table).where(primaryKeyFilter(this.table, this.data));
    return this;
  }

  static async insert<This extends ServiceSubclass>(
    this: This,
    context: Context,
    data: DataWithoutDefaults<TableTypeOf<This>>,
    event: Event | null,
    deferInsert?: boolean
  ): Promise<InstanceType<This> | null> {
    const table = this.entityTable as TableTypeOf<This>;
    const name = this.entityName;
    const dataWithDefaults = event ? insertDefaults(table, data, event) : { ...data };
    if (deferInsert ?? false) {
      serviceLog(`Deferring insert for ${name}`);
      return new this(table, name, context, dataWithDefaults) as InstanceType<This>;
    }
    const [insert] = await context.db.sql
      .insert(table as OnchainTable)
      .values(dataWithDefaults)
      .onConflictDoNothing()
      .returning();
    serviceLog(`Inserting ${name}`, expandInlineObject(dataWithDefaults));
    if (!insert) return null;
    return new this(table, name, context, insert) as InstanceType<This>;
  }

  /**
   * One multi-row `INSERT … ON CONFLICT DO UPDATE` (same semantics as {@link Service#save}).
   * Do not use `sql\`excluded.${col}\`` here: Drizzle expands it to `excluded.schema.table.col`,
   * which Ponder’s PG proxy rejects (“cross-database references are not implemented”). Use
   * `sql.raw(\`excluded."column"\`)` with the column’s DB name instead.
   */
  static async saveMany<This extends ServiceSubclass>(
    this: This,
    context: Context,
    instances: InstanceType<This>[],
    event: Event | null
  ): Promise<InstanceType<This>[]> {
    const table = this.entityTable as TableTypeOf<This>;
    const name = this.entityName;
    if (instances.length === 0) return [];
    if (!("insert" in context.db.sql)) throw new Error(`Read only database`);

    const rows = instances.map((inst) => {
      const svc = inst as InstanceType<This> & Service<TableTypeOf<This>>;
      return event ? updateDefaults(table, svc.read(), event) : { ...svc.read() };
    }) as TableTypeOf<This>["$inferInsert"][];

    const pkNames = getPrimaryKeysFieldNames(table);
    const pkSet = new Set(pkNames.map((k) => String(k)));
    const pkTarget = pkNames.map((key) => table[key]);
    const createdNulls = timestamper("created", undefined);
    const columns = getTableColumns(table);
    const conflictSet: Record<string, unknown> = { ...createdNulls };
    for (const [key, col] of Object.entries(columns)) {
      if (pkSet.has(key)) continue;
      if (Object.prototype.hasOwnProperty.call(createdNulls, key)) continue;
      const pgName = (col as { name: string }).name;
      const quoted = `"${pgName.replace(/"/g, '""')}"`;
      conflictSet[key] = sql.raw(`excluded.${quoted}`);
    }

    const returned = await context.db.sql
      .insert(table as OnchainTable)
      .values(rows)
      .onConflictDoUpdate({
        target: pkTarget,
        set: conflictSet as TableTypeOf<This>["$inferInsert"],
      })
      .returning();

    serviceLog(`saveMany ${name} count=${returned.length}`);
    if (returned.length !== instances.length) {
      throw new Error(
        `saveMany ${name}: expected ${instances.length} rows, got ${returned.length}`
      );
    }

    for (let i = 0; i < instances.length; i++) {
      applySaveManyReturningToInstance(
        instances[i] as InstanceType<This> & Service<TableTypeOf<This>>,
        returned[i]! as TableTypeOf<This>["$inferSelect"]
      );
    }
    return instances;
  }

  /**
   * Batch insert with `onConflictDoNothing`, same defaults as {@link insert}. Returns one instance per inserted row.
   */
  static async insertMany<This extends ServiceSubclass>(
    this: This,
    context: Context,
    rows: DataWithoutDefaults<TableTypeOf<This>>[],
    event: Event | null
  ): Promise<InstanceType<This>[]> {
    const table = this.entityTable as TableTypeOf<This>;
    const name = this.entityName;
    if (rows.length === 0) return [];
    const withDefaults = event
      ? rows.map((data) => insertDefaults(table, data, event))
      : (rows as TableTypeOf<This>["$inferInsert"][]);
    const inserted = await context.db.sql
      .insert(table as OnchainTable)
      .values(withDefaults)
      .onConflictDoNothing()
      .returning();
    serviceLog(`insertMany ${name} count=${inserted.length}`);
    return inserted.map((row) => new this(table, name, context, row) as InstanceType<This>);
  }

  /**
   * Finds an existing record in the database by query criteria.
   *
   * @param context - Database and client context
   * @param query - Query criteria to find the record
   * @returns Promise that resolves to a service instance for the found record
   * @throws {Error} When no record matches the query criteria
   */
  static async get<This extends ServiceSubclass>(
    this: This,
    context: Context | ReadOnlyContext,
    query: Partial<ExtendedQuery<TableTypeOf<This>["$inferInsert"]>>
  ): Promise<InstanceType<This> | null> {
    const table = this.entityTable as TableTypeOf<This>;
    const name = this.entityName;
    const db = "sql" in context.db ? context.db.sql : context.db;
    serviceLog("get", name, expandInlineObject(query));
    const filter = queryToFilter(table, query);
    if (filter === undefined) {
      throw new Error(
        `${name}.get requires at least one defined query field (empty object or only undefined values)`
      );
    }
    const [entity] = await db
      .select()
      .from(table as OnchainTable)
      .where(filter)
      .limit(1);
    if (!entity) return null;
    serviceLog(`Found ${name}: `, expandInlineObject(entity));
    return new this(table, name, context, entity) as InstanceType<This>;
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
  static async getOrInit<This extends ServiceSubclass>(
    this: This,
    context: Context,
    query: DataWithoutDefaults<TableTypeOf<This>>,
    event: Event,
    onInit?: (entity: TableTypeOf<This>["$inferSelect"]) => Promise<void>,
    deferInsert?: boolean
  ): Promise<InstanceType<This>>;
  static async getOrInit<This extends ServiceSubclass>(
    this: This,
    context: Context,
    query: TableTypeOf<This>["$inferInsert"],
    event: null,
    onInit?: (entity: TableTypeOf<This>["$inferSelect"]) => Promise<void>,
    deferInsert?: boolean
  ): Promise<InstanceType<This>>;
  static async getOrInit<This extends ServiceSubclass>(
    this: This,
    context: Context,
    query: DataWithoutDefaults<TableTypeOf<This>> | TableTypeOf<This>["$inferInsert"],
    event: Event | null,
    onInit?: (entity: TableTypeOf<This>["$inferSelect"]) => Promise<void>,
    deferInsert?: boolean
  ): Promise<InstanceType<This>> {
    const table = this.entityTable as TableTypeOf<This>;
    const name = this.entityName;
    const dataWithDefaults = event ? insertDefaults(table, query, event) : { ...query };
    serviceLog("getOrInit", name, expandInlineObject(dataWithDefaults));
    let entity = await context.db.find(table as any, dataWithDefaults);
    serviceLog(`Found ${name}: `, expandInlineObject(entity));
    if (!entity) {
      if (onInit) {
        serviceLog(`Executing onInit for ${name}`);
        await onInit(dataWithDefaults);
      }
      if (deferInsert ?? false) {
        serviceLog(`Deferring insert for ${name}`);
        return new this(table, name, context, dataWithDefaults) as InstanceType<This>;
      }
      serviceLog(`Initialising ${name}: `, expandInlineObject(dataWithDefaults));
      const [insert] = await context.db.sql
        .insert(table as OnchainTable)
        .values(dataWithDefaults)
        .onConflictDoNothing()
        .returning();
      entity = insert ?? null;
      if (!entity) throw new Error(`Failed to initialise ${name}: ${expandInlineObject(query)}`);
    }
    return new this(table, name, context, entity) as InstanceType<This>;
  }

  /**
   * Updates an existing record or creates a new one if it doesn't exist.
   *
   * @param context - Database and client context
   * @param query - Query criteria to find or create the record
   * @returns Promise that resolves to a service instance
   * @throws {Error} When the upsert operation fails
   */
  static async upsert<This extends ServiceSubclass>(
    this: This,
    context: Context,
    query: TableTypeOf<This>["$inferInsert"],
    event: null
  ): Promise<InstanceType<This> | null>;
  static async upsert<This extends ServiceSubclass>(
    this: This,
    context: Context,
    query: DataWithoutDefaults<TableTypeOf<This>>,
    event: Event
  ): Promise<InstanceType<This> | null>;
  static async upsert<This extends ServiceSubclass>(
    this: This,
    context: Context,
    query: DataWithoutDefaults<TableTypeOf<This>> | TableTypeOf<This>["$inferInsert"],
    event: Event | null
  ): Promise<InstanceType<This> | null> {
    const table = this.entityTable as TableTypeOf<This>;
    const name = this.entityName;
    const dataWithDefaults = event ? insertDefaults(table, query, event) : { ...query };
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
    return new this(table, name, context, entity) as InstanceType<This>;
  }

  /**
   * Queries the database for multiple records matching the criteria.
   *
   * @param context - Database and client context
   * @param query - Query criteria to filter records
   * @returns Promise that resolves to an array of service instances
   */
  static async query<This extends ServiceSubclass>(
    this: This,
    context: Context | ReadOnlyContext,
    query: Partial<ExtendedQuery<TableTypeOf<This>["$inferSelect"]>>
  ): Promise<InstanceType<This>[]> {
    const table = this.entityTable as TableTypeOf<This>;
    const name = this.entityName;
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
          (sort: { field: keyof TableTypeOf<This>; direction: "asc" | "desc" }) => {
            const column = table[sort.field];
            return sort.direction === "asc" ? asc(column) : desc(column);
          }
        )
      );
    const results = await q;
    serviceLog(`Found ${results.length} ${name}`);
    return results.map((result) => new this(table, name, context, result) as InstanceType<This>);
  }

  /**
   * Counts the number of records matching the query criteria.
   *
   * @param context - Database and client context
   * @param query - Query criteria to filter records
   * @returns Promise that resolves to the count of matching records
   */
  static async count<This extends ServiceSubclass>(
    this: This,
    context: Context | ReadOnlyContext,
    query: Partial<ExtendedQuery<TableTypeOf<This>["$inferSelect"]>>
  ): Promise<number> {
    const table = this.entityTable as TableTypeOf<This>;
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
  const primaryKeysFieldNames = [...new Set([...directPkNames, ...compositePkNames])];
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
export function getPrimaryKeysFields<T extends OnchainTable>(table: T, data: T["$inferSelect"]) {
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
  return props.reduce(
    function (result, prop) {
      result[prop] = obj[prop];
      return result;
    },
    {} as Pick<T, K>
  );
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
export function primaryKeyFilter<T extends OnchainTable>(table: T, data: T["$inferSelect"]) {
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
 * @returns Drizzle filter, or `undefined` when there is nothing to filter on (e.g. `{}` or only
 *   `undefined` values). Callers that need a predicate (`get`) must handle `undefined`; `count` /
 *   `query` omit `.where()` and match all rows.
 */
function queryToFilter<T extends OnchainTable>(
  table: T,
  query: Partial<ExtendedQuery<T["$inferInsert"]>>
) {
  const queryEntries = Object.entries(query).filter(
    ([key, value]) => !key.startsWith("_") && value !== undefined
  );
  const queries = queryEntries.map(([column, value]) => {
    if (value === null) {
      if (column.endsWith("_not")) return isNotNull(table[column.slice(0, -4) as keyof T]);
      return isNull(table[column as keyof T]);
    }
    if (column.endsWith("_not")) return not(eq(table[column.slice(0, -4) as keyof T], value));
    if (column.endsWith("_in")) return inArray(table[column.slice(0, -3) as keyof T], value);
    if (column.endsWith("_lte")) return lte(table[column.slice(0, -4) as keyof T], value);
    if (column.endsWith("_lt")) return lt(table[column.slice(0, -3) as keyof T], value);
    if (column.endsWith("_gte")) return gte(table[column.slice(0, -4) as keyof T], value);
    if (column.endsWith("_gt")) return gt(table[column.slice(0, -3) as keyof T], value);
    return eq(table[column as keyof T], value);
  });
  if (queries.length === 0) {
    return undefined;
  }
  if (queries.length === 1) {
    return queries[0]!;
  }
  return and(...queries);
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
  const dataWithDefaults = { ...data } as T["$inferInsert"] & CreationProps<T> & UpdateProps<T>;
  if ("createdAt" in table)
    dataWithDefaults.createdAt = new Date(Number(event.block.timestamp) * 1000);
  if ("createdAtBlock" in table) dataWithDefaults.createdAtBlock = Number(event.block.number);
  if ("createdAtTxHash" in table && "transaction" in event)
    dataWithDefaults.createdAtTxHash = event.transaction.hash as `0x${string}`;
  if ("updatedAt" in table)
    dataWithDefaults.updatedAt = new Date(Number(event.block.timestamp) * 1000);
  if ("updatedAtBlock" in table) dataWithDefaults.updatedAtBlock = Number(event.block.number);
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
  if ("updatedAtBlock" in table) dataWithDefaults.updatedAtBlock = Number(event.block.number);
  if ("updatedAtTxHash" in table && "transaction" in event)
    dataWithDefaults.updatedAtTxHash = event.transaction.hash as `0x${string}`;
  return dataWithDefaults;
}

/** Refreshes in-memory row after `saveMany` `RETURNING` (not exported; avoids a public instance mutator). */
function applySaveManyReturningToInstance<T extends OnchainTable>(
  inst: Service<T>,
  row: T["$inferSelect"]
): void {
  (inst as Service<T> & { data: T["$inferSelect"] }).data = row;
}
