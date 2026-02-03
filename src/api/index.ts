import schema from "ponder:schema";
import { db } from "ponder:api";
import { Hono } from "hono";
import { graphql, client } from "ponder";
import * as Services from "../services";
import { formatBigIntToDecimal } from "../helpers/formatter";

const app = new Hono();
const context = { db };

app.use("/", graphql({ db, schema }));
app.use("/sql/*", client({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

const jsonDefaultHeaders = {
  charset: "utf-8",
  "Content-Type": "application/json",
};
app.get("/tokens/:address/total-issuance", async (c) => {
  const address = c.req.param("address") as `0x${string}`;
  const tokenInstance = await Services.TokenInstanceService.get(context, { address });
  if (!tokenInstance)
    return c.json({ error: "TokenInstance address not found" }, 404, jsonDefaultHeaders);
  const { tokenId } = tokenInstance.read();

  const token = await Services.TokenService.get(context, { id: tokenId });
  if (!token) return c.json({ error: "Token not found" }, 404, jsonDefaultHeaders);

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
  const tokenInstance = await Services.TokenInstanceService.get(context, { address });
  if (!tokenInstance) return c.json({ error: "TokenInstance not found" }, 404, jsonDefaultHeaders);
  const { tokenId } = tokenInstance.read();

  const token = await Services.TokenService.get(context, { id: tokenId });
  if (!token) return c.json({ error: "Token not found" }, 404, jsonDefaultHeaders);

  const { tokenPrice } = token.read();
  if (tokenPrice === null) return c.json({ error: "Token price not set" }, 404);

  return c.json({ result: formatBigIntToDecimal(tokenPrice) }, 200, jsonDefaultHeaders);
});

app.get("/stats", async (c) => {
  const tvl = await Services.TokenService.getNormalisedTvl(context);
  const aggregatedSupply = await Services.TokenService.getNormalisedAggregatedSupply(context);
  const services = Object.values(Services).filter((service) => "count" in service);
  const entityNames = services.map(
    (service) => service.name.substring(0, service.name.length - "Service".length) + "s"
  );
  const entityCounts = await Promise.all(services.map((service) => service.count(context, {})));
  const response = Object.fromEntries(
    entityNames.map((name, index) => [name, entityCounts[index]])
  );
  return c.json(
    {
      tvl: formatBigIntToDecimal(tvl),
      aggregatedSupply: formatBigIntToDecimal(aggregatedSupply),
      ...response,
    },
    200,
    jsonDefaultHeaders
  );
});

export default app;
