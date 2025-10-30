import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { graphql } from "ponder";
import { TokenService } from "../services/TokenService";

const app = new Hono();

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

app.get("/tokens/:address/total-issuance", async (c) => {
  const address = c.req.param("address") as `0x${string}`;

  const token = await TokenService.getTokenByInstanceAddress(db, address);

  if (!token) return c.json({ error: "Token not found" }, 404);
  return c.json({ result: String(token.totalIssuance) });
});

app.get("/tokens/:address/price", async (c) => {
  const address = c.req.param("address") as `0x${string}`;

  const token = await TokenService.getTokenByInstanceAddress(db, address);

  if (!token) return c.json({ error: "Token not found" }, 404);
  return c.json({ result: String(token.tokenPrice) });
});

export default app;
