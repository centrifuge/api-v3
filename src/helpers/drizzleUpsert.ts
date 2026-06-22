import type { SQL } from "drizzle-orm";
import type { PgInsertValue, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";

export type { PgInsertValue, PgUpdateSetSource };

/**
 * Empty typed accumulator for ON CONFLICT DO UPDATE SET builders.
 * @returns Empty conflict set
 */
export function emptyUpdateSet<T extends PgTable>(): PgUpdateSetSource<T> {
  return {};
}

/**
 * Assigns a SQL expression to a conflict-set column (dynamic key loops).
 * @param set - Conflict set under construction
 * @param key - Drizzle insert column key
 * @param expr - SQL merge expression
 */
export function assignUpdateSetSql<T extends PgTable>(
  set: PgUpdateSetSource<T>,
  key: keyof PgUpdateSetSource<T> & string,
  expr: SQL
): void {
  set[key] = expr;
}
