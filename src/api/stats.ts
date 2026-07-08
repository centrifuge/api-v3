import { Hono } from "hono";
import { ReadonlyDrizzle } from "ponder";
import schema from "ponder:schema";
import { RAY, rpow } from "../helpers/bigintMath";
import { formatBigIntToDecimal } from "../helpers/formatter";
import * as Services from "../services";
import { jsonDefaultHeaders } from "./shared";
import { apiContext, type ApiContext, type ApiEnv } from "./types";

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
export function createStatsApp() {
  const app = new Hono<ApiEnv>();

  app.get("/", async (c) => {
    const ctx = apiContext(c);
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

  app.get("/basin-debt", async (c) => {
    const ctx = apiContext(c);
    const rows = await Services.BasinDebtService.query(ctx, {});
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

    const debts = rows.map((row) => {
      const data = row.read();
      const lastSeconds = BigInt(Math.floor(data.lastUpdatedAt.getTime() / 1000));
      const elapsed = nowSeconds > lastSeconds ? nowSeconds - lastSeconds : 0n;
      // Same accrual rule as BasinDebtService: interest only compounds on positive debt.
      const currentDebt =
        elapsed > 0n && data.debt > 0n
          ? (data.debt * rpow(data.ratePerSecondRay, elapsed)) / RAY
          : data.debt;

      return {
        chainId: data.chainId,
        basinAddress: data.basinAddress,
        tokenId: data.tokenId,
        poolId: data.poolId.toString(),
        debt: data.debt.toString(),
        currentDebt: currentDebt.toString(),
        currentDebtDecimal:
          currentDebt >= 0n
            ? formatBigIntToDecimal(currentDebt)
            : `-${formatBigIntToDecimal(-currentDebt)}`,
        ssrPerSecondRay: data.ssrPerSecondRay.toString(),
        ratePerSecondRay: data.ratePerSecondRay.toString(),
        spreadBps: data.spreadBps,
        creditTokenBalance: data.creditTokenBalance.toString(),
        pendingCreditTokenAmount: data.pendingCreditTokenAmount.toString(),
        lastUpdatedAt: data.lastUpdatedAt.toISOString(),
        accruedToTimestamp: Number(nowSeconds),
      };
    });

    return c.json({ basinDebts: debts }, 200, jsonDefaultHeaders);
  });

  return app;
}
