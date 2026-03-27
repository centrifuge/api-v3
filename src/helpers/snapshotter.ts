import { Service } from "../services/Service.js";
import { ponder } from "ponder:registry";
import type { Context, Event } from "ponder:registry";
import { getTableName } from "drizzle-orm";
import { PgTableWithColumns } from "drizzle-orm/pg-core";
import { serviceLog } from "./logger";

type TriggerEvent = Parameters<typeof ponder.on>[0] | `${string}:NewPeriod`;

export type SnapshotterOptions<S extends Service<any>> = {
  /** Extra columns merged after `entity.read()` (e.g. yields on `token_snapshot`). */
  augment?: (entity: S) => Record<string, unknown>;
  /** Row timestamp; default block time. */
  timestamp?: Date;
};

/** Insert snapshot rows (`onConflictDoNothing`). */
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
  const timestamp = options?.timestamp ?? new Date(Number(event.block.timestamp) * 1000);
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

  await context.db.sql
    .insert(snapshotTable)
    .values(rows as any)
    .onConflictDoNothing();
}
