import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../smoke/lib/context.mjs", () => ({
  resolveCentrifugeChain: vi.fn(),
}));

import { runSmoke } from "../smoke/checks/pool-spoke-presence.mjs";
import { resolveCentrifugeChain } from "../smoke/lib/context.mjs";

const mockedResolve = vi.mocked(resolveCentrifugeChain);

type SmokeCtx = Parameters<typeof runSmoke>[0];

interface MockChainOpts {
  spoke?: string | null;
  chainName?: string;
  centrifugeId?: string;
  activePools?: Set<string>;
}

/**
 * Builds a fake resolved chain for `resolveCentrifugeChain`, with a `readContract`
 * that reports `isPoolActive` true for pool IDs in `activePools`.
 * @param opts - Overrides for spoke address, chain name, centrifugeId, and active pools.
 */
function mockChain(opts: MockChainOpts) {
  return {
    chainId: 1,
    chainName: opts.chainName ?? "ethereum",
    centrifugeId: opts.centrifugeId ?? "1",
    deployment: {
      spoke: opts.spoke === undefined ? "0xSPOKE000000000000000000000000000000000" : opts.spoke,
    },
    client: {
      readContract: vi.fn(async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
        if (functionName === "isPoolActive") {
          const poolId = String(args[0]);
          return opts.activePools?.has(poolId) ?? false;
        }
        throw new Error(`unexpected readContract call: ${functionName}`);
      }),
    },
  } as never;
}

interface FakeLink {
  poolId: string;
  centrifugeId: string;
  blockchain?: { id: string; name: string };
}

interface FakePool {
  id: string;
}

/**
 * Builds a smoke context mock: `paginate` returns `links` for `poolSpokeBlockchains`
 * and `pools` for `pools`; `getBlockchainMap` returns `blockchainMap`.
 * @param links - Indexed `poolSpokeBlockchain` rows.
 * @param pools - Indexed hub pools.
 * @param blockchainMap - Map of centrifugeId to chain metadata.
 */
function mockCtx(links: FakeLink[], pools: FakePool[], blockchainMap: Map<string, { chainId: number; name: string }>): SmokeCtx {
  return {
    paginate: vi.fn(async (_query: string, listField: string) => {
      if (listField === "poolSpokeBlockchains") return links;
      if (listField === "pools") return pools;
      return [];
    }),
    getBlockchainMap: vi.fn(async () => blockchainMap),
    filters: {},
    atBlock: undefined,
    mismatch: vi.fn((m: Record<string, unknown>) => ({ smokeId: "pool-spoke-presence", ...m })),
  } as unknown as SmokeCtx;
}

describe("pool-spoke-presence smoke - reverse only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records mismatch for active pool with no link", async () => {
    const map = new Map([["1", { chainId: 1, name: "ethereum" }]]);
    const ctx = mockCtx([], [{ id: "100" }], map);
    mockedResolve.mockResolvedValue(mockChain({ activePools: new Set(["100"]) }));

    const result = await runSmoke(ctx);

    expect(result.checked).toBe(1);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]).toMatchObject({
      entityId: "pool:100@ethereum",
      field: "poolSpokeBlockchain",
      indexed: "missing",
      onchain: "isPoolActive=true",
    });
  });

  it("no mismatch for active pool with a link", async () => {
    const map = new Map([["1", { chainId: 1, name: "ethereum" }]]);
    const ctx = mockCtx(
      [{ poolId: "100", centrifugeId: "1" }],
      [{ id: "100" }],
      map
    );
    mockedResolve.mockResolvedValue(mockChain({ activePools: new Set(["100"]) }));

    const result = await runSmoke(ctx);

    expect(result.checked).toBe(1);
    expect(result.mismatches).toHaveLength(0);
  });

  it("no mismatch for inactive pool with no link", async () => {
    const map = new Map([["1", { chainId: 1, name: "ethereum" }]]);
    const ctx = mockCtx([], [{ id: "100" }], map);
    mockedResolve.mockResolvedValue(mockChain({ activePools: new Set() }));

    const result = await runSmoke(ctx);

    expect(result.checked).toBe(1);
    expect(result.mismatches).toHaveLength(0);
  });

  it("skips spoke with no deployment.spoke", async () => {
    const map = new Map([["1", { chainId: 1, name: "ethereum" }]]);
    const ctx = mockCtx([], [{ id: "100" }], map);
    mockedResolve.mockResolvedValue(mockChain({ spoke: null }));

    const result = await runSmoke(ctx);

    expect(result.checked).toBe(0);
    expect(result.mismatches).toHaveLength(0);
  });

  it("handles two chains: active on one (mismatch), inactive on other (no mismatch)", async () => {
    const map = new Map([
      ["1", { chainId: 1, name: "ethereum" }],
      ["8453", { chainId: 8453, name: "base" }],
    ]);
    const ctx = mockCtx([], [{ id: "9001" }], map);
    mockedResolve.mockImplementation((async (_ctx: unknown, centrifugeId: string) => {
      if (centrifugeId === "1") {
        return mockChain({ centrifugeId: "1", chainName: "ethereum", activePools: new Set(["9001"]) });
      }
      return mockChain({ centrifugeId: "8453", chainName: "base", activePools: new Set() });
    }) as never);

    const result = await runSmoke(ctx);

    expect(result.checked).toBe(2);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]).toMatchObject({
      entityId: "pool:9001@ethereum",
      field: "poolSpokeBlockchain",
      indexed: "missing",
      onchain: "isPoolActive=true",
    });
  });
});
