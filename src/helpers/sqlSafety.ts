import { sql, type SQL } from "drizzle-orm";

/**
 * Typed PostgreSQL parameter binds for Ponder's `context.db.sql` proxy.
 *
 * Drizzle `sql` templates send JS primitives as **text** params. In `COALESCE(col, $n)`
 * or `col = $n`, PostgreSQL rejects mixed types (timestamp/text, integer/text, text/bytea).
 *
 * Always use `bindPg*` helpers here — never `${date}`, `${n}`, or `${hex}` directly in raw SQL.
 * Enforcement: `test/parity/raw-sql-bindings.test.ts`.
 */

/** Exported bind helper names (keep in sync with tests). */
export const PG_TYPED_BIND_HELPERS = [
  "bindPgTimestamp",
  "bindPgTimestampOrNull",
  "bindPgInteger",
  "bindPgBigint",
  "bindPgHex",
  "bindPgHexBytes32",
] as const;

/**
 * Identifier segment safe inside double-quoted PostgreSQL names (see quotePgIdent).
 * Allows deploy schemas such as sha-e758a75; rejects quote/null bytes that break escaping.
 */
const PG_QUOTED_IDENT_SEGMENT = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

/** `bytes32` hex string (payload id, tx hash, message hash). */
const HEX_BYTES32 = /^0x[0-9a-fA-F]{64}$/;

/**
 * Validates a segment used inside double-quoted PostgreSQL identifiers.
 * Call before embedding names in `sql.raw` (schema/table/column/enum type names).
 * @param name - Identifier segment
 * @param label - Context for error messages
 */
export function assertPgIdentSegment(name: string, label: string): void {
  if (!PG_QUOTED_IDENT_SEGMENT.test(name)) {
    throw new Error(`Invalid SQL identifier for ${label}`);
  }
}

/**
 * Validates a `0x`-prefixed 32-byte hex string before SQL parameter binding.
 * @param value - Hex string from chain data
 * @param label - Context for error messages
 */
export function assertHexBytes32(value: string, label: string): void {
  if (!HEX_BYTES32.test(value)) {
    throw new Error(`Invalid ${label}: expected 0x-prefixed 32-byte hex`);
  }
}

/**
 * Validates payload index is a non-negative integer safe for SQL binding.
 * @param value - Payload index
 */
export function assertSafePayloadIndex(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid payload index: ${value}`);
  }
}

/**
 * Binds a JS Date as PostgreSQL `timestamp` (matches Ponder `t.timestamp()` columns).
 * Raw `${date}` in Drizzle `sql` templates is sent as text and breaks `COALESCE` with timestamp columns.
 * @param date - Valid JavaScript Date
 * @returns Parameterized `CAST(... AS timestamp)` fragment
 */
export function bindPgTimestamp(date: Date): SQL {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Invalid timestamp bind");
  }
  return sql`CAST(${date.toISOString()} AS timestamp)`;
}

/**
 * Binds a nullable timestamp for SQL `IS NOT NULL` status CASE branches on INSERT.
 * @param value - Fact timestamp or null/undefined when unset
 * @returns Parameterized timestamp bind or typed SQL NULL
 */
export function bindPgTimestampOrNull(value: Date | null | undefined): SQL {
  if (value == null) return sql`CAST(NULL AS timestamp)`;
  return bindPgTimestamp(value);
}

/**
 * Binds a JS integer as PostgreSQL `integer` (matches Ponder `t.integer()` columns).
 * Raw `${n}` in Drizzle `sql` templates is sent as text and breaks `COALESCE` with integer columns.
 * @param value - Safe integer value
 * @returns Parameterized `CAST(... AS integer)` fragment
 */
export function bindPgInteger(value: number): SQL {
  if (!Number.isInteger(value)) {
    throw new Error("Invalid integer bind");
  }
  return sql`CAST(${value} AS integer)`;
}

/**
 * Binds a JS bigint as PostgreSQL `bigint` (matches Ponder `t.bigint()` columns).
 * @param value - Safe bigint value
 * @returns Parameterized `CAST(... AS bigint)` fragment
 */
export function bindPgBigint(value: bigint): SQL {
  return sql`CAST(${value.toString()} AS bigint)`;
}

/**
 * Normalizes hex for Ponder `PgHex` driver values (lowercase `0x` prefix).
 * @param value - Valid hex string
 * @returns Lowercase driver hex
 */
function normalizeDriverHex(value: `0x${string}`): `0x${string}` {
  if (value.length % 2 === 0) return value.toLowerCase() as `0x${string}`;
  return `0x0${value.slice(2)}`.toLowerCase() as `0x${string}`;
}

/**
 * Binds a `0x`-prefixed hex string as PostgreSQL `text` (Ponder `PgHex` SQL type).
 * @param value - Valid hex string
 * @returns Parameterized `CAST(... AS text)` fragment
 */
export function bindPgHex(value: `0x${string}`): SQL {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error("Invalid hex bind");
  }
  return sql`CAST(${normalizeDriverHex(value)} AS text)`;
}

/**
 * Binds a `0x`-prefixed bytes32 hex string as PostgreSQL `text` (Ponder `PgHex` SQL type).
 * @param value - Valid bytes32 hex string
 * @returns Parameterized `CAST(... AS text)` fragment
 */
export function bindPgHexBytes32(value: `0x${string}`): SQL {
  assertHexBytes32(value, "hex");
  return bindPgHex(value);
}

/**
 * Validates anchor tx hash before SQL parameter binding.
 * @param anchor - Receive anchor fields from reconciliation
 */
export function assertPayloadStatusReceiveAnchor(anchor: {
  receivedAt: Date;
  receivedAtBlock: number;
  receivedAtTxHash: string;
  receivedAtChainId: number;
}): void {
  if (!(anchor.receivedAt instanceof Date) || Number.isNaN(anchor.receivedAt.getTime())) {
    throw new Error("Invalid receive anchor: receivedAt");
  }
  if (!Number.isInteger(anchor.receivedAtBlock) || anchor.receivedAtBlock < 0) {
    throw new Error("Invalid receive anchor: receivedAtBlock");
  }
  if (!Number.isInteger(anchor.receivedAtChainId) || anchor.receivedAtChainId <= 0) {
    throw new Error("Invalid receive anchor: receivedAtChainId");
  }
  assertHexBytes32(anchor.receivedAtTxHash, "receivedAtTxHash");
}
