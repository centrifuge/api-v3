import { afterEach, describe, expect, it } from "vitest";
import { erpcRpcConfigForChain } from "../smoke/lib/erpc.mjs";

describe("erpcRpcConfigForChain", () => {
  const envKeys = ["ERPC_BASE_URL", "ERPC_API_KEY", "ERPC_ARCHITECTURE"] as const;

  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  it("builds {base}/evm/{chainId}?secret= from project-scoped ERPC_BASE_URL", () => {
    process.env.ERPC_BASE_URL = "https://erpc.cfg.embrio.tech/main";
    process.env.ERPC_API_KEY = "smoke-secret";

    const config = erpcRpcConfigForChain(999);
    expect(config?.urls[0]).toBe(
      "https://erpc.cfg.embrio.tech/main/evm/999?secret=smoke-secret"
    );
  });

  it("omits secret query param when ERPC_API_KEY is unset", () => {
    process.env.ERPC_BASE_URL = "https://erpc.cfg.embrio.tech/main/";

    const config = erpcRpcConfigForChain(1);
    expect(config?.urls[0]).toBe("https://erpc.cfg.embrio.tech/main/evm/1");
  });

  it("returns null when ERPC_BASE_URL is unset", () => {
    expect(erpcRpcConfigForChain(1)).toBeNull();
  });
});
