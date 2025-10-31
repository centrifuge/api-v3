import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { graphql } from "ponder";
import { TokenInstanceService } from "../services";

const app = new Hono();

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

app.get("/tokens/:address/total-issuance", async (c) => {
  const address = c.req.param("address") as `0x${string}`;

  const tokenInstance = await TokenInstanceService.get(null, { address });
  if (!tokenInstance) return c.json({ error: "Token not found" }, 404);
  const { totalIssuance } = tokenInstance.read();
  if(totalIssuance === null) return c.json({ error: "Total issuance not set" }, 404);
  return c.json({ result: totalIssuance.toString() });
});

app.get("/tokens/:address/price", async (c) => {
  const address = c.req.param("address") as `0x${string}`;

  const token = await TokenInstanceService.get(null, { address });
  if (!token) return c.json({ error: "Token not found" }, 404);
  const { tokenPrice } = token.read();
  if(tokenPrice === null) return c.json({ error: "Token price not set" }, 404);
  return c.json({ result: tokenPrice.toString() });
});

export default app;
