import { describe, expect, it } from "vitest";
import { CrosschainMessageService } from "../../../src/services/CrosschainMessageService";
import {
  messageStatusSetSql,
  payloadSimpleStatusSetSql,
  payloadStatusForInsertSql,
} from "../../../src/services/crosschainStatusSql";

/** Collects string fragments from a Drizzle SQL tree. */
function collectSqlStrings(node: { queryChunks: unknown[] }): string {
  let result = "";
  for (const chunk of node.queryChunks) {
    if (typeof chunk === "string") {
      result += chunk;
      continue;
    }
    if (!chunk || typeof chunk !== "object") continue;
    if ("queryChunks" in chunk) {
      result += collectSqlStrings(chunk as { queryChunks: unknown[] });
      continue;
    }
    if ("value" in chunk && Array.isArray((chunk as { value: unknown }).value)) {
      result += (chunk as { value: string[] }).value.join("");
    }
  }
  return result;
}

/** Thin wrapper around `CrosschainMessageService.aggregatePoolAndTokenFromRows`. */
function aggregatePoolAndTokenFromRows(
  rows: readonly { poolId: bigint | null; tokenId: `0x${string}` | null }[]
): [poolId: bigint | null, tokenId: `0x${string}` | null] {
  return CrosschainMessageService.aggregatePoolAndTokenFromRows(
    rows.map((row) => ({ read: () => row }))
  );
}

describe("crosschain status SQL builders", () => {
  it("exports message status CASE without Unsent branch", () => {
    const sqlObj = messageStatusSetSql();
    const sqlText = JSON.stringify(sqlObj);
    expect(sqlText).toContain("AwaitingBatchDelivery");
    expect(sqlText).not.toContain("Unsent");
  });

  it("exports payload simple status CASE with sentAt and underpaidAt", () => {
    const sqlText = JSON.stringify(payloadSimpleStatusSetSql());
    expect(sqlText).toContain("sent_at");
    expect(sqlText).toContain("underpaid_at");
  });

  it("insert and conflict payload status CASE share priority (sent before underpaid)", () => {
    const conflict = collectSqlStrings(payloadSimpleStatusSetSql());
    const insert = collectSqlStrings(
      payloadStatusForInsertSql({ sentAt: new Date("2024-06-01T12:00:00Z") })
    );
    const sentIdx = (s: string) => s.indexOf("'InTransit'");
    const underpaidIdx = (s: string) => s.indexOf("'Underpaid'");
    expect(sentIdx(conflict)).toBeGreaterThan(-1);
    expect(sentIdx(insert)).toBeGreaterThan(-1);
    expect(sentIdx(conflict)).toBeLessThan(underpaidIdx(conflict));
    expect(sentIdx(insert)).toBeLessThan(underpaidIdx(insert));
  });
});

describe("payloadStatusForInsertSql", () => {
  const t = new Date("2024-06-01T12:00:00Z");

  it("uses parameterized timestamp binds for skip-underpaid create (sentAt only)", () => {
    const sqlText = collectSqlStrings(payloadStatusForInsertSql({ sentAt: t }));
    expect(sqlText).toContain("CASE");
    expect(sqlText).toContain("CAST(");
    expect(sqlText).toContain("AS timestamp");
    expect(sqlText).toContain("'InTransit'");
    expect(sqlText).not.toMatch(/sentAt|underpaidAt/);
  });

  it("binds NULL for unset fact timestamps", () => {
    const sqlText = collectSqlStrings(payloadStatusForInsertSql({}));
    expect(sqlText).toContain("CAST(NULL AS timestamp)");
  });
});

describe("aggregatePoolAndTokenFromRows", () => {
  it("aggregates a single pool and token from linked rows", () => {
    const [poolId, tokenId] = aggregatePoolAndTokenFromRows([
      { poolId: 1n, tokenId: "0x01" },
      { poolId: 1n, tokenId: "0x02" },
    ]);
    expect(poolId).toBe(1n);
    expect(tokenId).toBe("0x02");
  });

  it("returns null pair when multiple pools are present", () => {
    const [poolId, tokenId] = aggregatePoolAndTokenFromRows([
      { poolId: 1n, tokenId: null },
      { poolId: 2n, tokenId: null },
    ]);
    expect(poolId).toBeNull();
    expect(tokenId).toBeNull();
  });

  it("propagates prepare-row pool/token for UnderpaidBatch link path", () => {
    const [poolId, tokenId] = aggregatePoolAndTokenFromRows([
      { poolId: 42n, tokenId: "0xabcd" as `0x${string}` },
    ]);
    expect(poolId).toBe(42n);
    expect(tokenId).toBe("0xabcd");
  });
});
