import type { Context } from "hono";
import type { db } from "ponder:api";

/** Hono env for custom REST routes that use the readonly API database. */
export type ApiEnv = {
  Variables: {
    db: typeof db;
  };
};

/** Service-layer context shape (matches {@link ReadOnlyContext}). */
export type ApiContext = { db: typeof db };

/**
 * Builds service context from Hono handler context.
 * @param c - Hono context with `db` set by {@link apiDbMiddleware}
 * @returns Readonly DB wrapper for entity services
 */
export function apiContext(c: Context<ApiEnv>): ApiContext {
  return { db: c.get("db") };
}
