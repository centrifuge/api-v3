/**
 * Parity tests: asset decimal resolution pipeline (ISO → DB → hub RPC → spoke RPC).
 * Run: node --experimental-strip-types --test scripts/parity/resolve-asset-decimals.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  centrifugeIdFromAssetId,
  resolveAssetDecimals,
  resolveHubChainId,
} from "../../src/helpers/assetDecimals.ts";

describe("centrifugeIdFromAssetId", () => {
  it("returns null for zero asset id", () => {
    assert.equal(centrifugeIdFromAssetId(0n), null);
  });

  it("decodes high 16 bits as centrifuge id string", () => {
    const assetId = (42n << 112n) | 1000n;
    assert.equal(centrifugeIdFromAssetId(assetId), "42");
  });
});

describe("resolveHubChainId", () => {
  const lookup = (id: string) => (id === "7" ? 42161 : null);

  it("uses event chain when hub registry address is provided", () => {
    assert.equal(
      resolveHubChainId(1, { hubRegistryAddress: "0x0000000000000000000000000000000000000001" }, lookup),
      1
    );
  });

  it("uses pool home hub chain from centrifuge id", () => {
    assert.equal(resolveHubChainId(8453, { poolCentrifugeId: "7" }, lookup), 42161);
  });

  it("falls back to event chain when pool hub lookup misses", () => {
    assert.equal(resolveHubChainId(8453, { poolCentrifugeId: "999" }, lookup), 8453);
  });
});

describe("resolveAssetDecimals", () => {
  const customAssetId = (42n << 112n) | 5000n;

  it("returns 18 for ISO asset ids without calling deps", async () => {
    let called = false;
    const result = await resolveAssetDecimals(
      840n,
      1,
      undefined,
      {
        getAssetDecimalsFromDb: async () => {
          called = true;
          return 6;
        },
        readHubRegistryDecimals: async () => 6,
        readSpokeAssetDecimals: async () => 6,
      }
    );
    assert.equal(result, 18);
    assert.equal(called, false);
  });

  it("returns DB decimals and skips RPC", async () => {
    const calls: string[] = [];
    const result = await resolveAssetDecimals(
      customAssetId,
      1,
      undefined,
      {
        getAssetDecimalsFromDb: async () => {
          calls.push("db");
          return 6;
        },
        readHubRegistryDecimals: async () => {
          calls.push("hub");
          return 8;
        },
        readSpokeAssetDecimals: async () => {
          calls.push("spoke");
          return 9;
        },
      }
    );
    assert.equal(result, 6);
    assert.deepEqual(calls, ["db"]);
  });

  it("falls through hub RPC to spoke RPC on hub miss", async () => {
    const calls: string[] = [];
    const result = await resolveAssetDecimals(
      customAssetId,
      1,
      undefined,
      {
        getAssetDecimalsFromDb: async () => undefined,
        readHubRegistryDecimals: async () => {
          calls.push("hub");
          return undefined;
        },
        readSpokeAssetDecimals: async () => {
          calls.push("spoke");
          return 18;
        },
      }
    );
    assert.equal(result, 18);
    assert.deepEqual(calls, ["hub", "spoke"]);
  });

  it("returns hub RPC decimals when DB misses", async () => {
    const result = await resolveAssetDecimals(
      customAssetId,
      1,
      { hubRegistryAddress: "0x00000000000000000000000000000000000000aa" },
      {
        getAssetDecimalsFromDb: async () => undefined,
        readHubRegistryDecimals: async (_chainId, _assetId, hubRegistryAddress) => {
          assert.equal(hubRegistryAddress, "0x00000000000000000000000000000000000000aa");
          return 6;
        },
        readSpokeAssetDecimals: async () => 18,
      }
    );
    assert.equal(result, 6);
  });

  it("returns undefined when all sources miss", async () => {
    const result = await resolveAssetDecimals(
      customAssetId,
      1,
      undefined,
      {
        getAssetDecimalsFromDb: async () => undefined,
        readHubRegistryDecimals: async () => undefined,
        readSpokeAssetDecimals: async () => undefined,
      }
    );
    assert.equal(result, undefined);
  });
});
