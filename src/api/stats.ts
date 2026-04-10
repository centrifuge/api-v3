import { Hono } from "hono";
import { ReadonlyDrizzle } from "ponder";
import schema from "ponder:schema";
import { formatBigIntToDecimal } from "../helpers/formatter";
import * as Services from "../services";
import { jsonDefaultHeaders } from "./shared";
import type { ApiContext } from "./types";

/** Narrow surface for `/stats` entity counts — avoids TS2590 on `Object.values` + polymorphic statics. */
type ServiceWithEntityCount = {
  readonly name: string;
  count(
    context: { db: ReadonlyDrizzle<typeof schema> },
    query: Record<string, never>
  ): Promise<number>;
};

/**
 * Helper that avoids TS2590 on `Object.values` + polymorphic statics. (too much complexity to type)
 *
 * @param ctx - Database and client context
 * @param services - List of services to count
 * @returns Promise that resolves to an array of counts
 */
async function allEntityCounts(
  ctx: ApiContext,
  services: readonly ServiceWithEntityCount[]
): Promise<number[]> {
  return Promise.all(services.map((s) => s.count(ctx, {})));
}

/** Aggregated indexer stats mounted at `/stats`. */
export function createStatsApp(ctx: ApiContext) {
  const app = new Hono();

  app.get("/", async (c) => {
    const tvl = await Services.TokenService.getNormalisedTvl(ctx);
    const aggregatedSupply = await Services.TokenService.getNormalisedAggregatedSupply(ctx);
    const services = Object.values(Services).filter((service) => "count" in service);
    const entityNames = services.map(
      (service) => service.name.substring(0, service.name.length - "Service".length) + "s"
    );
    const entityCounts = await allEntityCounts(ctx, services);
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

  return app;
}
