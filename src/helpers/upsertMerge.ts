import { sql, type SQL } from "drizzle-orm";
import { assertPgIdentSegment } from "./sqlSafety";

/** Columns recomputed in ON CONFLICT SET — must not be blind-copied via saveMany. */
export const DERIVED_COLUMN_KEYS = new Set(["status", "crosschainInProgress", "state"]);

/**
 * Escapes a PostgreSQL identifier for use inside double-quoted SQL.
 * @param name - Raw column or table name
 * @returns Quoted identifier safe for embedding in sql.raw
 */
export function quotePgIdent(name: string): string {
  assertPgIdentSegment(name, "identifier");
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Schema-qualified PostgreSQL enum type for `::` casts in raw SQL.
 * Ponder creates per-schema enum types; unqualified casts resolve to `public` and fail on SET.
 * @param enumName - PostgreSQL enum type name (e.g. crosschain_message_status)
 * @returns Quoted `"schema"."enum_name"` fragment safe for sql.raw
 */
export function quotePgEnumType(enumName: string): string {
  assertPgIdentSegment(enumName, "enum type");
  const schema = process.env.DATABASE_SCHEMA ?? "public";
  assertPgIdentSegment(schema, "schema");
  return `${quotePgIdent(schema)}.${quotePgIdent(enumName)}`;
}

/**
 * Merge rule: earliest non-null timestamp (PG 14+ LEAST ignores nulls).
 * @param tablePgName - Existing row table name in SQL (e.g. crosschain_message)
 * @param colPgName - Snake_case column name (e.g. prepared_at)
 * @returns SQL fragment for ON CONFLICT SET
 */
export function mergeEarliest(tablePgName: string, colPgName: string): SQL {
  const t = quotePgIdent(tablePgName);
  const c = quotePgIdent(colPgName);
  return sql.raw(`
    CASE
      WHEN ${t}.${c} IS NULL THEN excluded.${c}
      WHEN excluded.${c} IS NULL THEN ${t}.${c}
      ELSE LEAST(${t}.${c}, excluded.${c})
    END
  `);
}

/**
 * Merge rule: COALESCE(existing, excluded).
 * @param tablePgName - Existing row table name in SQL
 * @param colPgName - Snake_case column name
 * @returns SQL fragment for ON CONFLICT SET
 */
export function mergeCoalesce(tablePgName: string, colPgName: string): SQL {
  const t = quotePgIdent(tablePgName);
  const c = quotePgIdent(colPgName);
  return sql.raw(`COALESCE(${t}.${c}, excluded.${c})`);
}

/**
 * Merge rule: sender-chain writer wins when both non-null (excluded wins on conflict).
 * @param tablePgName - Existing row table name in SQL
 * @param colPgName - Snake_case column name
 * @returns SQL fragment for ON CONFLICT SET
 */
export function mergeSenderWins(tablePgName: string, colPgName: string): SQL {
  const t = quotePgIdent(tablePgName);
  const c = quotePgIdent(colPgName);
  return sql.raw(`
    CASE
      WHEN excluded.${c} IS NOT NULL THEN excluded.${c}
      ELSE ${t}.${c}
    END
  `);
}

/**
 * Sender wins when excluded carries a real value; insert placeholders are ignored on conflict.
 * Used when partial upserts must satisfy NOT NULL columns on first insert without clobbering
 * existing decode fields (e.g. message_type `_Stub`, raw_data `0x`).
 * @param tablePgName - Existing row table name in SQL
 * @param colPgName - Snake_case column name
 * @param placeholderSqlLiteral - SQL literal for the insert-only sentinel (e.g. `'_Stub'`, `'0x'`)
 * @returns SQL fragment for ON CONFLICT SET
 */
export function mergeSenderWinsUnlessPlaceholder(
  tablePgName: string,
  colPgName: string,
  placeholderSqlLiteral: string
): SQL {
  const t = quotePgIdent(tablePgName);
  const c = quotePgIdent(colPgName);
  return sql.raw(`
    CASE
      WHEN excluded.${c} IS NOT NULL AND excluded.${c} IS DISTINCT FROM ${placeholderSqlLiteral} THEN excluded.${c}
      ELSE ${t}.${c}
    END
  `);
}

/**
 * Clears fail facts when execute merge sets executed_at.
 * @param tablePgName - Existing row table name in SQL
 * @param colPgName - Snake_case column name (failed_at or fail_reason)
 * @returns SQL fragment for ON CONFLICT SET
 */
export function mergeClearOnExecute(tablePgName: string, colPgName: string): SQL {
  const t = quotePgIdent(tablePgName);
  const c = quotePgIdent(colPgName);
  return sql.raw(`
    CASE
      WHEN excluded.executed_at IS NOT NULL THEN NULL
      ELSE COALESCE(excluded.${c}, ${t}.${c})
    END
  `);
}
