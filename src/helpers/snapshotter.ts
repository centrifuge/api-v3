import { Service } from "../services/Service";
import { ponder } from "ponder:registry";
import type { Context, Event } from "ponder:registry";
import { PgTableWithColumns } from "drizzle-orm/pg-core";

type TriggerEvent = Parameters<typeof ponder.on>[0] | `${string}:newPeriod`

export async function snapshotter<
  S extends Service<T>,
  T extends PgTableWithColumns<any>,
  ST extends PgTableWithColumns<any>
>(context: Context, event: Event, trigger: TriggerEvent, entities: S[], snapshotTable: ST ){
  if (entities.length === 0) {
    console.log("No entities to snapshot")
    return
  }
  for (const entity of entities) {
    const data = entity.read();
    console.log(`snapshotting ${data['id']}`)
    const snapshotData = { ...data, timestamp: new Date(Number(event.block.timestamp) * 1000), blockNumber: Number(event.block.number), trigger };
    await context.db.sql.insert(snapshotTable).values(snapshotData);
  }
}
