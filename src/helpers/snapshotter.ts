import { Service } from "../services/Service.js";
import { ponder } from "ponder:registry";
import type { Context, Event } from "ponder:registry";
import { getTableName } from "drizzle-orm";
import { PgTableWithColumns } from "drizzle-orm/pg-core";
import { serviceLog } from "./logger";

/**
 * Type representing trigger events that can initiate a snapshot.
 * Includes Ponder events and custom period-based triggers.
 */
type TriggerEvent = Parameters<typeof ponder.on>[0] | `${string}:NewPeriod`;

export type SnapshotterOptions<S extends Service<any>> = {
  /**
   * Merged into each snapshot row after `entity.read()` (e.g. `token_snapshot` yield columns
   * that are not stored on the live `token` row).
   */
  augment?: (entity: S) => Record<string, unknown>;
  /**
   * Row `timestamp` when it should differ from the block time (e.g. UTC midnight for `:NewPeriod`).
   */
  timestamp?: Date;
};

/**
 * Creates snapshots of entity data and stores them in a specified database table.
 *
 * This function reads each entity, optionally merges `augment`, and batch-inserts snapshot rows.
 *
 * @template S - The service type that extends Service<T>
 * @template T - The entity table type that extends PgTableWithColumns
 * @template ST - The snapshot table type that extends PgTableWithColumns
 */
export async function snapshotter<
  S extends Service<T>,
  T extends PgTableWithColumns<any>,
  ST extends PgTableWithColumns<any>,
>(
  context: Context,
  event: Event,
  trigger: TriggerEvent,
  entities: S[],
  snapshotTable: ST,
  options?: SnapshotterOptions<S>
) {
  if (entities.length === 0) {
    serviceLog(`No entities to snapshot`);
    return;
  }
  // @ts-ignore - transaction is not typed
  const { transaction } = event;
  const chainId = (context.chain.id as number).toString();
  const timestamp =
    options?.timestamp ?? new Date(Number(event.block.timestamp) * 1000);
  const blockNumber = Number(event.block.number);

  const rows = entities.map((entity) => {
    const data = entity.read();
    const extra = options?.augment?.(entity) ?? {};
    return {
      ...data,
      ...extra,
      timestamp,
      blockNumber,
      trigger,
      triggerTxHash: transaction?.hash,
      triggerChainId: chainId,
    };
  });

  const sampleId = rows[0]?.["id"] ?? rows[0]?.["tokenId"];
  serviceLog(
    `snapshotting ${entities.length} row(s) into ${getTableName(snapshotTable)} sampleId=${String(sampleId)}`
  );

  await context.db.sql.insert(snapshotTable).values(rows as any).onConflictDoNothing();
}
