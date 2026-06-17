import { beforeEach, describe, expect, it } from "vitest";
import { CrosschainMessage } from "ponder:schema";
import { createMockDb } from "../helpers/mockDb";

describe("createMockDb", () => {
  let db: ReturnType<typeof createMockDb>["db"];
  let mock: ReturnType<typeof createMockDb>["mock"];

  beforeEach(() => {
    ({ db, mock } = createMockDb());
  });

  it("returns mocked select results via drizzle.mock()", async () => {
    mock.onSelect(CrosschainMessage).respond([]);

    const rows = await db.select().from(CrosschainMessage);
    expect(rows).toEqual([]);
  });
});
