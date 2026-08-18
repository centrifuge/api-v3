import { describe, expect, it } from "vitest";
import { mergeSenderWinsUnlessPlaceholder } from "../../../src/helpers/upsertMerge";
import { buildCrosschainPayloadConflictSet } from "../../../src/services/CrosschainPayloadService";

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

describe("mergeSenderWinsUnlessPlaceholder", () => {
  it("builds conflict SQL that treats placeholders as absent", () => {
    const fragment = mergeSenderWinsUnlessPlaceholder(
      "crosschain_message",
      "message_type",
      "_Stub"
    );
    expect(fragment).toBeTruthy();
    expect(fragment).toHaveProperty("queryChunks");
    const sqlText = collectSqlStrings(fragment);
    expect(sqlText).toMatch(/message_type/);
    expect(sqlText).toMatch(/DISTINCT FROM/);
  });

  it("binds placeholder value via bindPgText and rejects injection-shaped input", () => {
    const fragment = mergeSenderWinsUnlessPlaceholder(
      "crosschain_message",
      "message_type",
      "_Stub"
    );
    const sqlText = collectSqlStrings(fragment);
    expect(sqlText).toContain("CAST(");
    expect(sqlText).toContain("AS text");
    expect(sqlText).toMatch(/DISTINCT FROM/);

    expect(() =>
      mergeSenderWinsUnlessPlaceholder(
        "crosschain_message",
        "message_type",
        "x' OR 1=1 --"
      )
    ).toThrow(/Invalid text bind/);
  });
});

describe("crosschainPayloadStatusCase (Bug C)", () => {
  it("ranks PartiallyFailed above Delivered in upsert CASE", () => {
    const serialized = JSON.stringify(buildCrosschainPayloadConflictSet().status);
    const partialIdx = serialized.indexOf("partially_failed_at");
    const deliveredIdx = serialized.indexOf("delivered_at");
    expect(partialIdx).toBeGreaterThan(-1);
    expect(deliveredIdx).toBeGreaterThan(-1);
    expect(partialIdx).toBeLessThan(deliveredIdx);
  });
});
