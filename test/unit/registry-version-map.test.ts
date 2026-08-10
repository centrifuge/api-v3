import { afterEach, describe, expect, it } from "vitest";
import {
  applyLocalRegistryPatches,
  groupRegistriesByVersionMap,
  parseRegistryPatchEnvValue,
  parseRegistryVersionMap,
  REGISTRY_DELETE,
  registryVersionToFileSlug,
  resolveRegistryChain,
} from "../../scripts/fetch-registry.mjs";

/**
 * Minimal registry-shaped blob for tests. Matches the real registry shape so the merge logic
 * (which deep-merges nested objects like `deployment` and `contracts`) exercises the same paths.
 */
type TestRegistry = {
  network: "mainnet";
  previousRegistry: unknown;
  version: string | null;
  deploymentInfo: { gitCommit: string };
  chains: Record<string, {
    network: { chainId: number; centrifugeId: number };
    adapters: unknown;
    contracts: Record<string, { address: `0x${string}` | null; blockNumber?: number | null }>;
    deployment: { deployedAt: number | null; startBlock: number; endBlock: number | null };
  }>;
  adapters: unknown;
  abis: Record<string, unknown>;
};

function makeRegistry(version: string, opts: {
  chains?: Record<string, {
    startBlock: number;
    contracts?: Record<string, { address: `0x${string}` | null; blockNumber?: number | null }>;
  }>;
  abis?: Record<string, unknown>;
} = {}): TestRegistry {
  const chains: TestRegistry["chains"] = {};
  for (const [chainId, c] of Object.entries(opts.chains ?? {})) {
    chains[chainId] = {
      network: { chainId: Number(chainId), centrifugeId: 1 },
      adapters: {},
      contracts: c.contracts ?? {},
      deployment: { deployedAt: null, startBlock: c.startBlock, endBlock: null },
    };
  }
  return {
    network: "mainnet",
    previousRegistry: null,
    version,
    deploymentInfo: { gitCommit: "deadbeef" },
    chains,
    adapters: {},
    abis: opts.abis ?? {},
  };
}

const ORIGINAL_MAP = process.env.REGISTRY_VERSION_MAP;

afterEach(() => {
  if (ORIGINAL_MAP === undefined) delete process.env.REGISTRY_VERSION_MAP;
  else process.env.REGISTRY_VERSION_MAP = ORIGINAL_MAP;
});

describe("parseRegistryVersionMap", () => {
  it("returns null when unset", () => {
    delete process.env.REGISTRY_VERSION_MAP;
    expect(parseRegistryVersionMap()).toBeNull();
  });

  it("returns null when empty", () => {
    process.env.REGISTRY_VERSION_MAP = "  ";
    expect(parseRegistryVersionMap()).toBeNull();
  });

  it("parses single + array values and normalizes v prefixes", () => {
    process.env.REGISTRY_VERSION_MAP = JSON.stringify({
      v3: "v3",
      v3_1: ["v3_1", "v3_2"],
      "3_3": "3_3",
    });
    const map = parseRegistryVersionMap();
    expect(map).not.toBeNull();
    expect(map!.get("v3")).toEqual(["3"]);
    expect(map!.get("v3_1")).toEqual(["3_1", "3_2"]);
    expect(map!.get("v3_3")).toEqual(["3_3"]);
  });

  it("throws on invalid JSON", () => {
    process.env.REGISTRY_VERSION_MAP = "{not json";
    expect(() => parseRegistryVersionMap()).toThrow(/invalid JSON/);
  });

  it("throws on non-object (array)", () => {
    process.env.REGISTRY_VERSION_MAP = JSON.stringify(["v3", "v3_1"]);
    expect(() => parseRegistryVersionMap()).toThrow(/JSON object/);
  });

  it("throws on non-object (null)", () => {
    process.env.REGISTRY_VERSION_MAP = "null";
    expect(() => parseRegistryVersionMap()).toThrow(/JSON object/);
  });

  it("throws on empty array value", () => {
    process.env.REGISTRY_VERSION_MAP = JSON.stringify({ v3_1: [] });
    expect(() => parseRegistryVersionMap()).toThrow(/no non-empty slugs/);
  });

  it("throws on duplicate slug within one value array", () => {
    process.env.REGISTRY_VERSION_MAP = JSON.stringify({ v3_1: ["v3_1", "v3_1"] });
    expect(() => parseRegistryVersionMap()).toThrow(/appears twice under handler version/);
  });

  it("throws on same slug across two handler keys", () => {
    process.env.REGISTRY_VERSION_MAP = JSON.stringify({
      v3: "v3_1",
      v3_1: "v3_1",
    });
    expect(() => parseRegistryVersionMap()).toThrow(/appears under two handler versions/);
  });

  it("throws on duplicate handler key (after normalization)", () => {
    process.env.REGISTRY_VERSION_MAP = JSON.stringify({
      v3_1: "v3_1",
      "3_1": "v3_2",
    });
    expect(() => parseRegistryVersionMap()).toThrow(/duplicate handler version/);
  });

  it("throws on non-string array element", () => {
    process.env.REGISTRY_VERSION_MAP = JSON.stringify({ v3_1: ["v3_1", 42] });
    expect(() => parseRegistryVersionMap()).toThrow(/string\[\]/);
  });

  it("throws on non-string, non-array value", () => {
    process.env.REGISTRY_VERSION_MAP = JSON.stringify({ v3_1: 42 });
    expect(() => parseRegistryVersionMap()).toThrow(/string or string\[\]/);
  });
});

describe("groupRegistriesByVersionMap", () => {
  it("folds two slugs into one handler blob with newest-wins on leaves", () => {
    const chain = [
      makeRegistry("v3.1.0", {
        chains: { "1": { startBlock: 100, contracts: { spoke: { address: "0xaaaa", blockNumber: 100 } } } },
        abis: { Spoke: { name: "Spoke", version: "v3.1.0" } } as never,
      }),
      makeRegistry("v3.2.0", {
        chains: { "1": { startBlock: 200, contracts: { spoke: { address: "0xbbbb", blockNumber: 200 }, hub: { address: "0xcccc", blockNumber: 200 } } } },
        abis: { Spoke: { name: "Spoke", version: "v3.2.0" } as never },
      }),
    ];
    const slugs = chain.map((r) => registryVersionToFileSlug(r.version));
    const map = new Map([["v3_1", ["3_1", "3_2"]]]);
    const { registryChain: grouped, versionSlugs } = groupRegistriesByVersionMap(chain, slugs, map);

    expect(versionSlugs).toEqual(["3_1"]);
    expect(grouped).toHaveLength(1);
    const merged = grouped[0] as TestRegistry;
    // newest deployment.startBlock wins
    expect(merged.chains["1"]!.deployment.startBlock).toBe(200);
    // newest spoke address wins (redeploy)
    expect(merged.chains["1"]!.contracts.spoke!.address).toBe("0xbbbb");
    // hub is new in v3_2 → added
    expect(merged.chains["1"]!.contracts.hub!.address).toBe("0xcccc");
    // newest ABI wins
    expect((merged.abis as never)["Spoke"]).toMatchObject({ version: "v3.2.0" });
  });

  it("emits handler versions in chronological order (by earliest slug index)", () => {
    const chain = [
      makeRegistry("v3.0.0"),
      makeRegistry("v3.1.0"),
      makeRegistry("v3.2.0"),
    ];
    const slugs = ["3", "3_1", "3_2"];
    // Insertion order deliberately out of chain order
    const map = new Map<string, string[]>([
      ["v3_1", ["3_1", "3_2"]],
      ["v3", ["3"]],
    ]);
    const { versionSlugs } = groupRegistriesByVersionMap(chain, slugs, map);
    expect(versionSlugs).toEqual(["3", "3_1"]);
  });

  it("drops unreferenced resolved slugs", () => {
    const chain = [makeRegistry("v3.0.0"), makeRegistry("v3.1.0"), makeRegistry("v3.2.0")];
    const slugs = ["3", "3_1", "3_2"];
    const map = new Map<string, string[]>([["v3", ["3"]]]);
    const { versionSlugs } = groupRegistriesByVersionMap(chain, slugs, map);
    expect(versionSlugs).toEqual(["3"]);
  });

  it("throws on unknown referenced slug", () => {
    const chain = [makeRegistry("v3.0.0")];
    const slugs = ["3"];
    const map = new Map<string, string[]>([["v3", ["3", "9_9"]]]);
    expect(() => groupRegistriesByVersionMap(chain, slugs, map)).toThrow(/unknown or unavailable version/);
  });

  it("single-element value passes the blob through unchanged (deep equal)", () => {
    const chain = [
      makeRegistry("v3.1.0", {
        chains: { "1": { startBlock: 100, contracts: { spoke: { address: "0xaaaa", blockNumber: 100 } } } },
      }),
    ];
    const slugs = ["3_1"];
    const map = new Map<string, string[]>([["v3_1", ["3_1"]]]);
    const { registryChain: grouped, versionSlugs } = groupRegistriesByVersionMap(chain, slugs, map);
    expect(versionSlugs).toEqual(["3_1"]);
    // mergeRegistriesOlderNewer returns a structuredClone, so deep-equal not reference-equal
    expect(grouped[0]).toEqual(chain[0]);
  });
});

describe("resolveRegistryChain + groupRegistriesByVersionMap", () => {
  it("folds null-version patches into their predecessor before grouping", () => {
    // [v3.1, null-patch, v3.2] → resolved [v3.1 (patched), v3.2] → fold into v3_1
    const chain = [
      makeRegistry("v3.1.0", {
        chains: { "1": { startBlock: 100, contracts: { spoke: { address: "0xaaaa", blockNumber: 100 } } } },
      }),
      makeRegistry(null as never, {
        chains: { "1": { startBlock: 100, contracts: { spoke: { address: "0xpatched", blockNumber: 100 } } } },
      }),
      makeRegistry("v3.2.0", {
        chains: { "1": { startBlock: 200, contracts: { hub: { address: "0xcccc", blockNumber: 200 } } } },
      }),
    ];
    const resolved = resolveRegistryChain(chain);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]!.version).toBe("v3.1.0");
    // patch applied to predecessor
    expect((resolved[0] as TestRegistry).chains["1"]!.contracts.spoke!.address).toBe("0xpatched");

    const slugs = resolved.map((r: TestRegistry) => registryVersionToFileSlug(r.version));
    const map = new Map<string, string[]>([["v3_1", ["3_1", "3_2"]]]);
    const { versionSlugs, registryChain: grouped } = groupRegistriesByVersionMap(resolved, slugs, map);
    expect(versionSlugs).toEqual(["3_1"]);
    // patch + v3_2 both present: patched spoke address (from null patch) and hub (from v3_2)
    const merged = grouped[0] as TestRegistry;
    expect(merged.chains["1"]!.contracts.spoke!.address).toBe("0xpatched");
    expect(merged.chains["1"]!.contracts.hub!.address).toBe("0xcccc");
  });
});

describe("parseRegistryPatchEnvValue", () => {
  it("returns the REGISTRY_DELETE sentinel for \"delete\"", () => {
    expect(parseRegistryPatchEnvValue("delete")).toBe(REGISTRY_DELETE);
  });

  it("treats \"delete\" case-sensitively (only lowercase triggers delete)", () => {
    expect(parseRegistryPatchEnvValue("Delete")).toBe("Delete");
    expect(parseRegistryPatchEnvValue("DELETE")).toBe("DELETE");
  });

  it("trims surrounding whitespace before matching", () => {
    expect(parseRegistryPatchEnvValue("  delete  ")).toBe(REGISTRY_DELETE);
  });

  it("still parses null/true/false/numbers and leaves other strings alone", () => {
    expect(parseRegistryPatchEnvValue("null")).toBeNull();
    expect(parseRegistryPatchEnvValue("true")).toBe(true);
    expect(parseRegistryPatchEnvValue("false")).toBe(false);
    expect(parseRegistryPatchEnvValue("1234")).toBe(1234);
    expect(parseRegistryPatchEnvValue("0xabc")).toBe("0xabc");
  });
});

describe("applyLocalRegistryPatches", () => {
  function baseBlob(): TestRegistry {
    return makeRegistry("v3.1.0", {
      chains: {
        "1": {
          startBlock: 100,
          contracts: {
            spoke: { address: "0xaaaa", blockNumber: 100 },
            onOffRampFactory: { address: "0xbbbb", blockNumber: 100 },
          },
        },
        "10": {
          startBlock: 200,
          contracts: { onOffRampFactory: { address: "0xcccc", blockNumber: 200 } },
        },
      },
    });
  }

  it("removes the key at the patch path when value is REGISTRY_DELETE", () => {
    const out = applyLocalRegistryPatches(baseBlob(), [
      { segments: ["chains", "1", "contracts", "onOffRampFactory"], value: REGISTRY_DELETE },
    ]) as TestRegistry;
    expect(out.chains["1"]!.contracts.onOffRampFactory).toBeUndefined();
    // sibling contract untouched
    expect(out.chains["1"]!.contracts.spoke!.address).toBe("0xaaaa");
    // other chain untouched
    expect(out.chains["10"]!.contracts.onOffRampFactory!.address).toBe("0xcccc");
  });

  it("does not mutate the input registry", () => {
    const input = baseBlob();
    applyLocalRegistryPatches(input, [
      { segments: ["chains", "1", "contracts", "onOffRampFactory"], value: REGISTRY_DELETE },
    ]);
    expect(input.chains["1"]!.contracts.onOffRampFactory).toBeDefined();
  });

  it("no-ops when deleting a missing path (no ancestor creation)", () => {
    const out = applyLocalRegistryPatches(baseBlob(), [
      { segments: ["chains", "999", "contracts", "onOffRampFactory"], value: REGISTRY_DELETE },
    ]) as TestRegistry;
    // nothing created for chain 999
    expect(out.chains["999"]).toBeUndefined();
  });

  it("sets a leaf value for non-delete patches (null stays null, not delete)", () => {
    const out = applyLocalRegistryPatches(baseBlob(), [
      { segments: ["chains", "1", "contracts", "onOffRampFactory", "address"], value: null },
    ]) as TestRegistry;
    // null sets the leaf; key remains (deprecation pattern), not removed
    expect(out.chains["1"]!.contracts.onOffRampFactory).toEqual({ address: null, blockNumber: 100 });
  });

  it("round-trips parseRegistryPatchEnvValue(\"delete\") into a deletion", () => {
    const out = applyLocalRegistryPatches(baseBlob(), [
      {
        segments: ["chains", "1", "contracts", "onOffRampFactory"],
        value: parseRegistryPatchEnvValue("delete"),
      },
    ]) as TestRegistry;
    expect(out.chains["1"]!.contracts.onOffRampFactory).toBeUndefined();
  });
});
