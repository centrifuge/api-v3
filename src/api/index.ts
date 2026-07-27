import { Hono } from "hono";
import { client, graphql } from "ponder";
import { db } from "ponder:api";
import schema from "ponder:schema";
import { createGlacisApp } from "./glacis";
import { apiDbMiddleware } from "./middleware";
import { createStatsApp } from "./stats";
import { createTokensApp } from "./tokens";
import type { ApiEnv } from "./types";

const app = new Hono<ApiEnv>();

app.use("/", graphql({ db, schema }));
app.use("/sql/*", client({ db, schema }));
//app.use("/graphql", graphql({ db, schema }));

app.use("/stats", apiDbMiddleware);
app.use("/stats/*", apiDbMiddleware);
app.route("/stats", createStatsApp());

app.use("/tokens", apiDbMiddleware);
app.use("/tokens/*", apiDbMiddleware);
app.route("/tokens", createTokensApp());

app.use("/transactions", apiDbMiddleware);
app.use("/transactions/*", apiDbMiddleware);
app.use("/routes", apiDbMiddleware);
app.use("/quote", apiDbMiddleware);
app.route("/", createGlacisApp());

export default app;
