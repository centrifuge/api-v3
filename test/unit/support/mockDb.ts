import { drizzle } from "drizzle-orm/node-postgres";
import { mockDatabase, type MockController } from "vitest-drizzle-mock";
import schema from "./ponder-schema";

/** Drizzle mock database typed with the Ponder schema. */
export type MockDb = ReturnType<typeof drizzle.mock<typeof schema>>;

/**
 * Creates an in-memory Drizzle instance via the official `drizzle.mock()` API
 * and a Vitest controller for registering per-table query responses.
 */
export function createMockDb(): { db: MockDb; mock: MockController<MockDb> } {
  const db = drizzle.mock({ schema });
  const mock = mockDatabase(db);
  return { db, mock };
}
