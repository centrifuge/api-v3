import { getTableColumns, type SQL } from "drizzle-orm";
import type { Context, Event } from "ponder:registry";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";
import { mergeCoalesce, mergeEarliest, mergeSenderWins } from "./upsertMerge";
import {
  crosschainInProgressCaseFromHub,
  crosschainInProgressCaseFromSpoke,
  type HubSpokePgCols,
} from "./crosschainInProgressCase";
import { getPrimaryKeysFieldNames } from "../services/Service";

type OnchainTable = PgTableWithColumns<any>;

/** Which leg of hub↔spoke correlation is being written (controls excluded.* usage). */
export type HubSpokeUpsertLeg = "hub" | "spoke";

/** Optional domain columns merged on spoke ack when present in the insert row. */
const SPOKE_DOMAIN_MERGE_KEYS = ["status"] as const;

/**
 * Null timestamper + chain id fields (for callers that need explicit nulls in JS objects).
 * @param fieldName - Base field name (e.g. hubSignal)
 * @returns Nullable At / AtBlock / AtTxHash / AtChainId fields
 */
export function nullTimestamperWithChain<N extends string>(fieldName: N) {
  return {
    [`${fieldName}At`]: null,
    [`${fieldName}AtBlock`]: null,
    [`${fieldName}AtTxHash`]: null,
    [`${fieldName}AtChainId`]: null,
  } as Record<string, null>;
}

/**
 * Resolves PostgreSQL column names for hub/spoke facts from a Drizzle table.
 * @param table - Entity table
 * @returns PG column names (enum columns are table-specific, e.g. vault_hub_signal_type)
 */
type HubSpokeFactPgCols = HubSpokePgCols & {
  hubSignalAtBlock: string;
  hubSignalAtTxHash: string;
  hubSignalAtChainId: string;
  spokeAckAtBlock: string;
  spokeAckAtTxHash: string;
  spokeAckAtChainId: string;
};

function hubSpokePgCols(table: OnchainTable): HubSpokeFactPgCols {
  const columns = getTableColumns(table);
  const pg = (key: string) => {
    const col = columns[key] as { name: string } | undefined;
    if (!col) throw new Error(`hubSpokePgCols: missing column ${key}`);
    return col.name;
  };
  return {
    hubSignalType: pg("hubSignalType"),
    hubSignalAt: pg("hubSignalAt"),
    hubSignalAtBlock: pg("hubSignalAtBlock"),
    hubSignalAtTxHash: pg("hubSignalAtTxHash"),
    hubSignalAtChainId: pg("hubSignalAtChainId"),
    spokeAckAt: pg("spokeAckAt"),
    spokeAckAtBlock: pg("spokeAckAtBlock"),
    spokeAckAtTxHash: pg("spokeAckAtTxHash"),
    spokeAckAtChainId: pg("spokeAckAtChainId"),
  };
}

/**
 * ON CONFLICT SET for hub-signal writes — only references excluded hub columns.
 * @param table - Drizzle table (for PG column names)
 * @param tablePgName - PostgreSQL table name
 * @returns Conflict set for Drizzle upsert
 */
export function buildHubSignalConflictSet(
  table: OnchainTable,
  tablePgName: string
): Record<string, SQL> {
  const cols = hubSpokePgCols(table);
  return {
    hubSignalType: mergeSenderWins(tablePgName, cols.hubSignalType),
    hubSignalAt: mergeEarliest(tablePgName, cols.hubSignalAt),
    hubSignalAtBlock: mergeCoalesce(tablePgName, cols.hubSignalAtBlock),
    hubSignalAtTxHash: mergeCoalesce(tablePgName, cols.hubSignalAtTxHash),
    hubSignalAtChainId: mergeCoalesce(tablePgName, cols.hubSignalAtChainId),
    crosschainInProgress: crosschainInProgressCaseFromHub(tablePgName, cols),
  };
}

/**
 * ON CONFLICT SET for spoke-ack writes — only references excluded spoke columns.
 * @param table - Drizzle table (for PG column names)
 * @param tablePgName - PostgreSQL table name
 * @param row - Insert row (domain merges only when key is present)
 * @returns Conflict set for Drizzle upsert
 */
export function buildSpokeAckConflictSet(
  table: OnchainTable,
  tablePgName: string,
  row: Record<string, unknown>
): Record<string, SQL> {
  const cols = hubSpokePgCols(table);
  const tableColumns = getTableColumns(table);
  const set: Record<string, SQL> = {
    spokeAckAt: mergeEarliest(tablePgName, cols.spokeAckAt),
    spokeAckAtBlock: mergeCoalesce(tablePgName, cols.spokeAckAtBlock),
    spokeAckAtTxHash: mergeCoalesce(tablePgName, cols.spokeAckAtTxHash),
    spokeAckAtChainId: mergeCoalesce(tablePgName, cols.spokeAckAtChainId),
    crosschainInProgress: crosschainInProgressCaseFromSpoke(tablePgName, cols),
  };

  for (const key of SPOKE_DOMAIN_MERGE_KEYS) {
    if (key in row && key in tableColumns) {
      const pgName = (tableColumns[key] as { name: string }).name;
      set[key] = mergeSenderWins(tablePgName, pgName);
    }
  }

  return set;
}

/**
 * Generic hub/spoke fact upsert with derived crosschainInProgress.
 * @param context - Ponder context
 * @param event - Source event
 * @param table - Drizzle table
 * @param tablePgName - PostgreSQL table name
 * @param serviceCtor - Service constructor
 * @param entityName - Log label
 * @param leg - Hub signal vs spoke ack (selects which excluded columns are legal)
 * @param row - Full insert row including PK
 * @returns Service instance
 */
export async function upsertHubSpokeFacts<T extends OnchainTable, S>(
  context: Context,
  event: Event,
  table: T,
  tablePgName: string,
  serviceCtor: new (table: T, name: string, context: Context, data: T["$inferSelect"]) => S,
  entityName: string,
  leg: HubSpokeUpsertLeg,
  row: T["$inferInsert"]
): Promise<S> {
  const conflictSet =
    leg === "hub"
      ? buildHubSignalConflictSet(table, tablePgName)
      : buildSpokeAckConflictSet(table, tablePgName, row as Record<string, unknown>);
  const pkNames = getPrimaryKeysFieldNames(table);
  const pkTarget = pkNames.map((key) => table[key as keyof T]);

  const [entity] = await context.db.sql
    .insert(table)
    .values(row)
    .onConflictDoUpdate({
      target: pkTarget,
      set: conflictSet as unknown as Partial<T["$inferInsert"]>,
    })
    .returning();

  if (!entity) throw new Error(`${entityName} upsertHubSpokeFacts failed`);
  return new serviceCtor(table, entityName, context, entity);
}
