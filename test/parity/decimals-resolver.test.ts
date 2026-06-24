import { describe, expect, it } from "vitest";
import { resolveTokenIdDecimalsLadder } from "../../src/helpers/decimalsResolver";

describe("resolveTokenIdDecimalsLadder", () => {
  const tokenId = `0x${"cd".repeat(16)}` as `0x${string}`;
  const shareAddress = `0x${"ab".repeat(20)}` as `0x${string}`;

  it("returns instance DB decimals before token DB", async () => {
    const result = await resolveTokenIdDecimalsLadder(
      10,
      tokenId,
      "2",
      {},
      {
        getTokenDecimalsFromDb: async () => 18,
        getInstanceDecimalsFromDb: async () => 6,
        resolvePoolCurrencyDecimals: async () => 9,
        readErc20Decimals: async () => 12,
      }
    );
    expect(result).toBe(6);
  });

  it("returns token DB decimals when instance misses", async () => {
    const calls: string[] = [];
    const result = await resolveTokenIdDecimalsLadder(
      10,
      tokenId,
      "2",
      { poolId: 1n, tokenAddress: shareAddress },
      {
        getTokenDecimalsFromDb: async () => {
          calls.push("token");
          return 6;
        },
        getInstanceDecimalsFromDb: async () => {
          calls.push("instance");
          return undefined;
        },
        resolvePoolCurrencyDecimals: async () => {
          calls.push("pool");
          return 9;
        },
        readErc20Decimals: async () => {
          calls.push("erc20");
          return 18;
        },
      }
    );
    expect(result).toBe(6);
    expect(calls).toEqual(["instance", "token"]);
  });

  it("falls through to instance DB decimals", async () => {
    const result = await resolveTokenIdDecimalsLadder(
      10,
      tokenId,
      "2",
      { poolId: 1n },
      {
        getTokenDecimalsFromDb: async () => undefined,
        getInstanceDecimalsFromDb: async (id, centrifugeId) => {
          expect(id).toBe(tokenId);
          expect(centrifugeId).toBe("2");
          return 6;
        },
        resolvePoolCurrencyDecimals: async () => 8,
        readErc20Decimals: async () => 18,
      }
    );
    expect(result).toBe(6);
  });

  it("falls through pool currency to ERC20 RPC", async () => {
    const calls: string[] = [];
    const result = await resolveTokenIdDecimalsLadder(
      8453,
      tokenId,
      "2",
      { poolId: 99n, tokenAddress: shareAddress },
      {
        getTokenDecimalsFromDb: async () => undefined,
        getInstanceDecimalsFromDb: async () => undefined,
        resolvePoolCurrencyDecimals: async (poolId) => {
          expect(poolId).toBe(99n);
          calls.push("pool");
          return undefined;
        },
        readErc20Decimals: async (chainId, address) => {
          expect(chainId).toBe(8453);
          expect(address).toBe(shareAddress);
          calls.push("erc20");
          return 18;
        },
      }
    );
    expect(result).toBe(18);
    expect(calls).toEqual(["pool", "erc20"]);
  });

  it("returns undefined when all sources miss", async () => {
    const result = await resolveTokenIdDecimalsLadder(1, tokenId, "2", {}, {
      getTokenDecimalsFromDb: async () => undefined,
      getInstanceDecimalsFromDb: async () => undefined,
      resolvePoolCurrencyDecimals: async () => undefined,
      readErc20Decimals: async () => undefined,
    });
    expect(result).toBeUndefined();
  });
});
