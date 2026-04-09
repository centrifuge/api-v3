import { Hono } from "hono";
import { formatBigIntToDecimal } from "../helpers/formatter";
import * as Services from "../services";
import { jsonDefaultHeaders } from "./shared";
import type { ApiContext } from "./types";

/** Token address endpoints mounted at `/tokens`. */
export function createTokensApp(ctx: ApiContext) {
  const app = new Hono();

  app.get("/:address/total-issuance", async (c) => {
    const address = c.req.param("address") as `0x${string}`;
    const tokenInstance = await Services.TokenInstanceService.get(ctx, { address });
    if (!tokenInstance) {
      return c.json({ error: "TokenInstance address not found" }, 404, jsonDefaultHeaders);
    }
    const { tokenId } = tokenInstance.read();

    const token = await Services.TokenService.get(ctx, { id: tokenId });
    if (!token) {
      return c.json({ error: "Token not found" }, 404, jsonDefaultHeaders);
    }

    const { totalIssuance, decimals } = token.read();
    if (totalIssuance === null) {
      return c.json({ error: "Total issuance not set" }, 404, jsonDefaultHeaders);
    }
    if (decimals === null) {
      return c.json({ error: "Token decimals not set" }, 404, jsonDefaultHeaders);
    }
    return c.json(
      { result: formatBigIntToDecimal(totalIssuance, decimals) },
      200,
      jsonDefaultHeaders
    );
  });

  app.get("/:address/price", async (c) => {
    const address = c.req.param("address") as `0x${string}`;
    const tokenInstance = await Services.TokenInstanceService.get(ctx, { address });
    if (!tokenInstance) {
      return c.json({ error: "TokenInstance not found" }, 404, jsonDefaultHeaders);
    }
    const { tokenId } = tokenInstance.read();

    const token = await Services.TokenService.get(ctx, { id: tokenId });
    if (!token) {
      return c.json({ error: "Token not found" }, 404, jsonDefaultHeaders);
    }

    const { tokenPrice } = token.read();
    if (tokenPrice === null) {
      return c.json({ error: "Token price not set" }, 404, jsonDefaultHeaders);
    }

    return c.json({ result: formatBigIntToDecimal(tokenPrice) }, 200, jsonDefaultHeaders);
  });

  return app;
}
