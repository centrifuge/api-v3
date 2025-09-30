import { Service } from "../services/Service";
import { ponder } from "ponder:registry";
import type { Context, Event } from "ponder:registry";
import { PgTableWithColumns } from "drizzle-orm/pg-core";
import { serviceLog } from "./logger";

/**
 * Type representing trigger events that can initiate a snapshot.
 * Includes Ponder events and custom period-based triggers.
 */
type TriggerEvent = Parameters<typeof ponder.on>[0] | `${string}:NewPeriod`;

/**
 * Creates snapshots of entity data and stores them in a specified database table.
 *
 * This function iterates through a list of entities, reads their current state,
 * and creates timestamped snapshots that include block information and trigger details.
 * Each snapshot is inserted into the provided snapshot table.
 *
 * @template S - The service type that extends Service<T>
 * @template T - The entity table type that extends PgTableWithColumns
 * @template ST - The snapshot table type that extends PgTableWithColumns
 *
 * @param {Context} context - The Ponder context containing database access and other utilities
 * @param {Event} event - The blockchain event that triggered this snapshot operation
 * @param {TriggerEvent} trigger - The specific trigger that initiated the snapshot (e.g., contract event or period trigger)
 * @param {S[]} entities - Array of service instances representing entities to snapshot
 * @param {ST} snapshotTable - The database table where snapshots will be stored
 *
 * @returns {Promise<void>} A promise that resolves when all snapshots have been created
 *
 * @example
 * ```typescript
 * await snapshotter(
 *   context,
 *   event,
 *   "Transfer",
 *   [userService, tokenService],
 *   snapshotsTable
 * );
 * ```
 */
export async function snapshotter<
  S extends Service<T>,
  T extends PgTableWithColumns<any>,
  ST extends PgTableWithColumns<any>
>(
  context: Context,
  event: Event,
  trigger: TriggerEvent,
  entities: S[],
  snapshotTable: ST
) {
  if (entities.length === 0) {
    serviceLog(`No entities to snapshot`);
    return;
  }
  // @ts-ignore - transaction is not typed
  const { transaction } = event;
  const chainId = (context.chain.id as number).toString();
  for (const entity of entities) {
    const data = entity.read();
    serviceLog(`snapshotting ${data["id"]}`);
    const snapshotData = {
      ...data,
      timestamp: new Date(Number(event.block.timestamp) * 1000),
      blockNumber: Number(event.block.number),
      trigger,
      triggerTxHash: transaction?.hash,
      triggerChainId: chainId,
    };
    await context.db.sql.insert(snapshotTable).values(snapshotData).onConflictDoNothing();
  }
}
