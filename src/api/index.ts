import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { graphql } from "ponder";
import { TokenInstanceService, TokenService } from "../services";

const app = new Hono();
const context = { db };

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

app.get("/tokens/:address/total-issuance", async (c) => {
  const address = c.req.param("address") as `0x${string}`;

  const tokenInstance = await TokenInstanceService.get(context, { address });
  if (!tokenInstance) return c.json({ error: "TokenInstance address not found" }, 404);
  const { tokenId } = tokenInstance.read();

  const token = await TokenService.get(context, { id: tokenId });
  if (!token) return c.json({ error: "Token not found" }, 404);

  const { totalIssuance } = token.read();
  if (totalIssuance === null)
    return c.json({ error: "Total issuance not set" }, 404);
  return c.json({ result: totalIssuance.toString() });
});

app.get("/tokens/:address/price", async (c) => {
  const address = c.req.param("address") as `0x${string}`;

  const tokenInstance = await TokenInstanceService.get(context, { address });
  if (!tokenInstance) return c.json({ error: "TokenInstance not found" }, 404);
  const { tokenId } = tokenInstance.read();

  const token = await TokenService.get(context, { id: tokenId });
  if (!token) return c.json({ error: "Token not found" }, 404);
  
  const { tokenPrice } = token.read();
  if (tokenPrice === null) return c.json({ error: "Token price not set" }, 404);
  return c.json({ result: tokenPrice.toString() });
});

export default app;
