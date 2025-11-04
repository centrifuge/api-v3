import schema from "ponder:schema";
import { db } from "ponder:api";
import { Hono } from "hono";
import { graphql } from "ponder";
import { TokenInstanceService, TokenService } from "../services";
import { formatBigIntToDecimal } from "../helpers/formatter";

const app = new Hono();
const context = { db };

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

const jsonDefaultHeaders = {
  charset: "utf-8",
  "Content-Type": "application/json",
};
app.get("/tokens/:address/total-issuance", async (c) => {
  const address = c.req.param("address") as `0x${string}`;
  const tokenInstance = await TokenInstanceService.get(context, { address });
  if (!tokenInstance)
    return c.json(
      { error: "TokenInstance address not found" },
      404,
      jsonDefaultHeaders
    );
  const { tokenId } = tokenInstance.read();

  const token = await TokenService.get(context, { id: tokenId });
  if (!token)
    return c.json({ error: "Token not found" }, 404, jsonDefaultHeaders);

  const { totalIssuance, decimals } = token.read();
  if (totalIssuance === null)
    return c.json({ error: "Total issuance not set" }, 404, jsonDefaultHeaders);
  if (decimals === null)
    return c.json({ error: "Token decimals not set" }, 404, jsonDefaultHeaders);
  return c.json(
    { result: formatBigIntToDecimal(totalIssuance, decimals) },
    200,
    jsonDefaultHeaders
  );
});

app.get("/tokens/:address/price", async (c) => {
  const address = c.req.param("address") as `0x${string}`;

  const tokenInstance = await TokenInstanceService.get(context, { address });
  if (!tokenInstance)
    return c.json(
      { error: "TokenInstance not found" },
      404,
      jsonDefaultHeaders
    );
  const { tokenId } = tokenInstance.read();

  const token = await TokenService.get(context, { id: tokenId });
  if (!token)
    return c.json({ error: "Token not found" }, 404, jsonDefaultHeaders);

  const { tokenPrice } = token.read();
  if (tokenPrice === null) return c.json({ error: "Token price not set" }, 404);

  return c.json(
    { result: formatBigIntToDecimal(tokenPrice) },
    200,
    jsonDefaultHeaders
  );
});

export default app;
