import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AdapterParticipation, CrosschainPayload } from "ponder:schema";
import {
  assertHexBytes32,
  assertPayloadStatusReceiveAnchor,
  assertPgIdentSegment,
  assertSafePayloadIndex,
  bindPgHexBytes32,
  bindPgBigint,
  bindPgInteger,
  bindPgTimestamp,
} from "../../src/helpers/sqlSafety";
import { quotePgEnumType, quotePgIdent } from "../../src/helpers/upsertMerge";
import { refreshPayloadStatusSql } from "../../src/services/crosschainStatusSql";

const VALID_ID = `0x${"ab".repeat(32)}` as `0x${string}`;
const VALID_ANCHOR = {
  receivedAt: new Date("2024-06-01T12:00:00Z"),
  receivedAtBlock: 100,
  receivedAtTxHash: VALID_ID,
  receivedAtChainId: 1,
};

/** Collects string fragments from a Drizzle SQL tree (avoids JSON.stringify on PgTable refs). */
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

describe("sqlSafety validators", () => {
  it("accepts valid PostgreSQL identifier segments", () => {
    expect(() => assertPgIdentSegment("crosschain_payload", "table")).not.toThrow();
    expect(quotePgIdent("public")).toBe('"public"');
  });

  it("accepts hyphenated deploy schema names in quoted identifiers", () => {
    expect(() => assertPgIdentSegment("sha-e758a75", "schema")).not.toThrow();
    expect(quotePgIdent("sha-e758a75")).toBe('"sha-e758a75"');

    const prev = process.env.DATABASE_SCHEMA;
    process.env.DATABASE_SCHEMA = "sha-e758a75";
    try {
      expect(quotePgEnumType("crosschain_message_status")).toBe(
        '"sha-e758a75"."crosschain_message_status"'
      );
    } finally {
      if (prev === undefined) delete process.env.DATABASE_SCHEMA;
      else process.env.DATABASE_SCHEMA = prev;
    }
  });

  it("rejects identifier injection attempts", () => {
    expect(() => assertPgIdentSegment('foo"; DROP TABLE users; --', "table")).toThrow(
      /Invalid SQL identifier/
    );
    expect(() => quotePgIdent('foo"; DROP TABLE users; --')).toThrow(/Invalid SQL identifier/);
  });

  it("accepts valid bytes32 hex", () => {
    expect(() => assertHexBytes32(VALID_ID, "payloadId")).not.toThrow();
  });

  it("rejects malformed hex values", () => {
    expect(() => assertHexBytes32("not-hex", "payloadId")).toThrow(/Invalid payloadId/);
    expect(() => assertHexBytes32("0x1234", "payloadId")).toThrow(/Invalid payloadId/);
    expect(() => assertHexBytes32(`${VALID_ID}' OR '1'='1`, "payloadId")).toThrow(
      /Invalid payloadId/
    );
  });

  it("rejects unsafe payload index values", () => {
    expect(() => assertSafePayloadIndex(-1)).toThrow(/Invalid payload index/);
    expect(() => assertSafePayloadIndex(1.5)).toThrow(/Invalid payload index/);
  });

  it("rejects invalid receive anchors", () => {
    expect(() =>
      assertPayloadStatusReceiveAnchor({
        ...VALID_ANCHOR,
        receivedAtTxHash: "0xdead",
      })
    ).toThrow(/receivedAtTxHash/);
  });

  it("bindPgTimestamp emits CAST AS timestamp", () => {
    const bound = bindPgTimestamp(VALID_ANCHOR.receivedAt);
    const sqlText = collectSqlStrings(bound);
    expect(sqlText).toContain("CAST(");
    expect(sqlText).toContain("AS timestamp");
  });

  it("bindPgInteger emits CAST AS integer", () => {
    const bound = bindPgInteger(VALID_ANCHOR.receivedAtBlock);
    const sqlText = collectSqlStrings(bound);
    expect(sqlText).toContain("CAST(");
    expect(sqlText).toContain("AS integer");
  });

  it("bindPgHexBytes32 emits CAST AS text for PgHex columns", () => {
    const bound = bindPgHexBytes32(VALID_ID);
    const sqlText = collectSqlStrings(bound);
    expect(sqlText).toContain("CAST(");
    expect(sqlText).toContain("AS text");
    expect(sqlText).not.toContain("decode(");
  });

  it("bindPgBigint emits CAST AS bigint", () => {
    const bound = bindPgBigint(42n);
    const sqlText = collectSqlStrings(bound);
    expect(sqlText).toContain("CAST(");
    expect(sqlText).toContain("AS bigint");
  });
});

describe("refreshPayloadStatusSql hardening", () => {
  it("builds parameterized SQL for valid inputs", () => {
    const stmt = refreshPayloadStatusSql(VALID_ANCHOR, VALID_ID, 0, {
      setDeliveredFromAnchor: true,
    });
    expect(stmt).toBeDefined();
    expect(stmt.queryChunks.length).toBeGreaterThan(0);
  });

  it("rejects invalid payloadId before building SQL", () => {
    expect(() =>
      refreshPayloadStatusSql(VALID_ANCHOR, "0xbad" as `0x${string}`, 0)
    ).toThrow(/Invalid payloadId/);
  });

  it("rejects invalid payload index before building SQL", () => {
    expect(() => refreshPayloadStatusSql(VALID_ANCHOR, VALID_ID, -1)).toThrow(
      /Invalid payload index/
    );
  });

  it("casts receive anchor timestamps for COALESCE with timestamp columns", () => {
    const stmt = refreshPayloadStatusSql(VALID_ANCHOR, VALID_ID, 0, {
      setDeliveredFromAnchor: true,
    });
    const sqlText = collectSqlStrings(stmt);
    expect(sqlText).toContain("CAST(");
    expect(sqlText).toContain("AS timestamp");
    expect(sqlText).toContain("AS integer");
    expect(sqlText).toContain("AS text");
    expect(sqlText).not.toContain("decode(");
  });

  it("uses crosschain_payload_status column name for status SET", () => {
    const statusCol = getTableColumns(CrosschainPayload).status.name;
    expect(statusCol).toBe("crosschain_payload_status");

    const stmt = refreshPayloadStatusSql(VALID_ANCHOR, VALID_ID, 0, {
      setDeliveredFromAnchor: true,
    });
    const sqlText = collectSqlStrings(stmt);
    expect(sqlText).toContain('"crosschain_payload_status" =');
  });

  it("uses adapter_participation_side column for adapter counts", () => {
    const sideCol = getTableColumns(AdapterParticipation).side.name;
    expect(sideCol).toBe("adapter_participation_side");

    const stmt = refreshPayloadStatusSql(VALID_ANCHOR, VALID_ID, 0);
    const sqlText = collectSqlStrings(stmt);
    expect(sqlText).toContain("adapter_participation_side");
    expect(sqlText).not.toMatch(/WHERE side =/);
  });
});
