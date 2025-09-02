import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { graphql, eq } from "ponder";

const app = new Hono();

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

app.get("/tokens/:id/total-issuance", async (c) => {
  const tokenId = c.req.param("id");

  const result = await db
    .select({ totalIssuance: schema.Token.totalIssuance })
    .from(schema.Token)
    .where(eq(schema.Token.id, tokenId));

  if (result.length === 0) return c.json({ result: "0" });
  return c.json({ result: String(result[0]!.totalIssuance) });
});

export default app;
