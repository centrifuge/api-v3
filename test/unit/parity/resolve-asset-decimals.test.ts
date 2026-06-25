import { describe, expect, it } from "vitest";
import {
  centrifugeIdFromAssetId,
  resolveAssetDecimals,
  resolveHubChainId,
} from "../../../src/helpers/decimalsResolver";

describe("centrifugeIdFromAssetId", () => {
  it("returns null for zero asset id", () => {
    expect(centrifugeIdFromAssetId(0n)).toBeNull();
  });

  it("decodes high 16 bits as centrifuge id string", () => {
    const assetId = (42n << 112n) | 1000n;
    expect(centrifugeIdFromAssetId(assetId)).toBe("42");
  });
});

describe("resolveHubChainId", () => {
  const lookup = (id: string) => (id === "7" ? 42161 : null);

  it("uses event chain when hub registry address is provided", () => {
    expect(
      resolveHubChainId(1, { hubRegistryAddress: "0x0000000000000000000000000000000000000001" }, lookup)
    ).toBe(1);
  });

  it("uses pool home hub chain from centrifuge id", () => {
    expect(resolveHubChainId(8453, { poolCentrifugeId: "7" }, lookup)).toBe(42161);
  });

  it("falls back to event chain when pool hub lookup misses", () => {
    expect(resolveHubChainId(8453, { poolCentrifugeId: "999" }, lookup)).toBe(8453);
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
    expect(result).toBe(18);
    expect(called).toBe(false);
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
    expect(result).toBe(6);
    expect(calls).toEqual(["db"]);
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
    expect(result).toBe(18);
    expect(calls).toEqual(["hub", "spoke"]);
  });

  it("returns hub RPC decimals when DB misses", async () => {
    const result = await resolveAssetDecimals(
      customAssetId,
      1,
      { hubRegistryAddress: "0x00000000000000000000000000000000000000aa" },
      {
        getAssetDecimalsFromDb: async () => undefined,
        readHubRegistryDecimals: async (_chainId, _assetId, hubRegistryAddress) => {
          expect(hubRegistryAddress).toBe("0x00000000000000000000000000000000000000aa");
          return 6;
        },
        readSpokeAssetDecimals: async () => 18,
      }
    );
    expect(result).toBe(6);
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
    expect(result).toBeUndefined();
  });
});
