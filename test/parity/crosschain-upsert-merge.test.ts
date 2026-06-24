import { describe, expect, it } from "vitest";
import { mergeSenderWinsUnlessPlaceholder } from "../../src/helpers/upsertMerge";
import { buildCrosschainPayloadConflictSet } from "../../src/services/CrosschainPayloadService";

describe("mergeSenderWinsUnlessPlaceholder", () => {
  it("builds conflict SQL that treats placeholders as absent", () => {
    const fragment = mergeSenderWinsUnlessPlaceholder(
      "crosschain_message",
      "message_type",
      "'_Stub'"
    );
    expect(fragment).toBeTruthy();
    expect(fragment).toHaveProperty("queryChunks");
    const serialized = JSON.stringify(fragment);
    expect(serialized).toMatch(/_Stub/);
    expect(serialized).toMatch(/message_type/);
    expect(serialized).toMatch(/DISTINCT FROM/);
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
