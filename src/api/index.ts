import { Hono } from "hono";
import { client, graphql } from "ponder";
import { db } from "ponder:api";
import schema from "ponder:schema";
import { createGlacisApp } from "./glacis";
import { createStatsApp } from "./stats";
import { createTokensApp } from "./tokens";
import type { ApiContext } from "./types";

const app = new Hono();
const context: ApiContext = { db };

app.use("/", graphql({ db, schema }));
app.use("/sql/*", client({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

app.route("/tokens", createTokensApp(context));
app.route("/", createGlacisApp(context));
app.route("/stats", createStatsApp(context));

export default app;
