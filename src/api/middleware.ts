import { createMiddleware } from "hono/factory";
import type { ApiEnv } from "./types";

/**
 * Injects the current readonly API `db` into Hono context on each request.
 *
 * Re-imports `ponder:api` per request so dev hot-reload does not serve a stale
 * pool from a module-level `{ db }` snapshot (see Ponder cache invalidation).
 */
export const apiDbMiddleware = createMiddleware<ApiEnv>(async (c, next) => {
  const { db } = await import("ponder:api");
  c.set("db", db);
  await next();
});
