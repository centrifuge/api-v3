import { afterEach, describe, expect, it } from "vitest";
import { rpcConfigForChain } from "../smoke/lib/rpc.mjs";

describe("rpcConfigForChain", () => {
  const envKeys = ["ERPC_BASE_URL", "ERPC_API_KEY", "ERPC_ARCHITECTURE"] as const;

  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  it("uses public RPC only when eRPC is unset", () => {
    const config = rpcConfigForChain(42161);
    expect(config?.urls).toEqual(["https://arb1.arbitrum.io/rpc"]);
  });

  it("prepends eRPC and appends public fallback for the same chain", () => {
    process.env.ERPC_BASE_URL = "https://erpc.cfg.embrio.tech/main";
    process.env.ERPC_API_KEY = "smoke-secret";

    const config = rpcConfigForChain(42161);
    expect(config?.urls).toEqual([
      "https://erpc.cfg.embrio.tech/main/evm/42161?secret=smoke-secret",
      "https://arb1.arbitrum.io/rpc",
    ]);
  });

  it("dedupes identical URLs case-insensitively", () => {
    process.env.ERPC_BASE_URL = "https://erpc.cfg.embrio.tech/main";

    const config = rpcConfigForChain(1);
    expect(config?.urls).toEqual([
      "https://erpc.cfg.embrio.tech/main/evm/1",
      "https://cloudflare-eth.com",
    ]);
  });
});
