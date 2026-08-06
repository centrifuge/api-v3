import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../smoke/lib/context.mjs", () => ({
  resolveEntityChain: vi.fn(),
}));

import { runSmoke } from "../smoke/checks/escrow.mjs";
import { resolveEntityChain } from "../smoke/lib/context.mjs";

const mockedResolve = vi.mocked(resolveEntityChain);

type SmokeCtx = Parameters<typeof runSmoke>[0];

interface MockChainOpts {
  balanceSheet?: string | null;
  spoke?: string | null;
  chainName?: string;
  isPoolActive?: boolean;
  escrowAddress?: string;
}

function mockChain(opts: MockChainOpts) {
  return {
    chainId: 1,
    chainName: opts.chainName ?? "ethereum",
    centrifugeId: "1",
    deployment: {
      balanceSheet: opts.balanceSheet === undefined ? "0xBAL0000000000000000000000000000000000000" : opts.balanceSheet,
      spoke: opts.spoke === undefined ? "0xSPOKE000000000000000000000000000000000000" : opts.spoke,
    },
    client: {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === "isPoolActive") return opts.isPoolActive ?? true;
        if (functionName === "escrow") return opts.escrowAddress ?? "0x0000000000000000000000000000000000000000";
        throw new Error(`unexpected readContract call: ${functionName}`);
      }),
    },
  } as never;
}

interface FakeEscrow {
  address: string;
  poolId: string;
  centrifugeId: string;
  createdAtBlock: number;
  blockchain?: { id: string; name: string };
}

function mockCtx(escrows: FakeEscrow[]): SmokeCtx {
  return {
    paginate: vi.fn().mockResolvedValue(escrows),
    filters: {},
    sampleCandidates: vi.fn((cands: FakeEscrow[]) => cands),
    atBlock: undefined,
    mismatch: vi.fn((m: Record<string, unknown>) => ({ smokeId: "escrow", ...m })),
  } as unknown as SmokeCtx;
}

describe("escrow smoke - isPoolActive skip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips pools not activated on the spoke", async () => {
    const escrows: FakeEscrow[] = [
      { address: "0xAAAa000000000000000000000000000000000000", poolId: "100", centrifugeId: "1", createdAtBlock: 100, blockchain: { id: "1", name: "ethereum" } },
    ];
    mockedResolve.mockResolvedValue(mockChain({ isPoolActive: false }));
    const ctx = mockCtx(escrows);

    const result = await runSmoke(ctx);

    expect(result.checked).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.mismatches).toHaveLength(0);
  });

  it("compares active pools with matching address", async () => {
    const escrows: FakeEscrow[] = [
      { address: "0xAAAa000000000000000000000000000000000000", poolId: "100", centrifugeId: "1", createdAtBlock: 100, blockchain: { id: "1", name: "ethereum" } },
    ];
    mockedResolve.mockResolvedValue(
      mockChain({ isPoolActive: true, escrowAddress: "0xAAAa000000000000000000000000000000000000" })
    );
    const ctx = mockCtx(escrows);

    const result = await runSmoke(ctx);

    expect(result.checked).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.mismatches).toHaveLength(0);
  });

  it("records mismatch for active pool with wrong address", async () => {
    const escrows: FakeEscrow[] = [
      { address: "0xBBBb000000000000000000000000000000000000", poolId: "100", centrifugeId: "1", createdAtBlock: 100, blockchain: { id: "1", name: "ethereum" } },
    ];
    mockedResolve.mockResolvedValue(
      mockChain({ isPoolActive: true, escrowAddress: "0xCCCc000000000000000000000000000000000000" })
    );
    const ctx = mockCtx(escrows);

    const result = await runSmoke(ctx);

    expect(result.checked).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]).toMatchObject({
      field: "address",
      indexed: "0xbbbb000000000000000000000000000000000000",
      onchain: "0xcccc000000000000000000000000000000000000",
    });
  });

  it("still compares when spoke address is missing (no skip)", async () => {
    const escrows: FakeEscrow[] = [
      { address: "0xAAAa000000000000000000000000000000000000", poolId: "100", centrifugeId: "1", createdAtBlock: 100, blockchain: { id: "1", name: "ethereum" } },
    ];
    mockedResolve.mockResolvedValue(
      mockChain({ spoke: null, escrowAddress: "0xAAAa000000000000000000000000000000000000" })
    );
    const ctx = mockCtx(escrows);

    const result = await runSmoke(ctx);

    expect(result.checked).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.mismatches).toHaveLength(0);
  });

  it("skips when balanceSheet is missing", async () => {
    const escrows: FakeEscrow[] = [
      { address: "0xAAAa000000000000000000000000000000000000", poolId: "100", centrifugeId: "1", createdAtBlock: 100, blockchain: { id: "1", name: "ethereum" } },
    ];
    mockedResolve.mockResolvedValue(mockChain({ balanceSheet: null, isPoolActive: true }));
    const ctx = mockCtx(escrows);

    const result = await runSmoke(ctx);

    expect(result.checked).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("handles same pool on two chains: skips inactive, compares active", async () => {
    const escrows: FakeEscrow[] = [
      { address: "0x34b7000000000000000000000000000000000000", poolId: "9001", centrifugeId: "1", createdAtBlock: 100, blockchain: { id: "1", name: "ethereum" } },
      { address: "0x1114000000000000000000000000000000000000", poolId: "9001", centrifugeId: "2", createdAtBlock: 200, blockchain: { id: "8453", name: "base" } },
    ];

    mockedResolve.mockImplementation((async (_ctx: unknown, row: FakeEscrow) => {
      if (row.centrifugeId === "1") {
        return mockChain({ isPoolActive: false, chainName: "ethereum" });
      }
      return mockChain({
        isPoolActive: true,
        escrowAddress: "0x1114000000000000000000000000000000000000",
        chainName: "base",
      });
    }) as never);

    const ctx = mockCtx(escrows);

    const result = await runSmoke(ctx);

    expect(result.checked).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.mismatches).toHaveLength(0);
  });
});
