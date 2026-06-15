import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeSenderWinsUnlessPlaceholder } from "../../src/helpers/upsertMerge.ts";

describe("mergeSenderWinsUnlessPlaceholder", () => {
  it("builds conflict SQL that treats placeholders as absent", () => {
    const fragment = mergeSenderWinsUnlessPlaceholder(
      "crosschain_message",
      "message_type",
      "'_Stub'"
    );
    assert.ok(fragment);
    assert.ok("queryChunks" in fragment);
    const serialized = JSON.stringify(fragment);
    assert.match(serialized, /_Stub/);
    assert.match(serialized, /message_type/);
    assert.match(serialized, /DISTINCT FROM/);
  });
});
