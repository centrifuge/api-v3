import type { Context } from "ponder:registry";
import { eq, and, gte, inArray } from "drizzle-orm";
import { TokenSnapshot } from "ponder:schema";

const WAD = 10n ** 18n;

const PRICE_UPDATE_TRIGGERS = [
  "shareClassManagerV3:UpdateShareClass",
  "shareClassManagerV3_1:UpdatePricePoolPerShare",
];

/** Triggers whose event args include a `computedAt` field that should be used as navDate. */
const TRIGGERS_WITH_COMPUTED_AT: string[] = [
  "shareClassManagerV3_1:UpdatePricePoolPerShare",
];

export type YieldMetrics = {
  yield7d365: number | null;
  yield7d360: number | null;
  yield30d365: number | null;
  yield30d360: number | null;
  yield30dCompound365: number | null;
  yield30dCompound360: number | null;
  yieldTtm: number | null;
  sinceInception: number | null;
  ytd: number | null;
  volatility30d: number | null;
  maxDrawdown: number | null;
  sharpeRatio: number | null;
};

const NULL_METRICS: YieldMetrics = {
  yield7d365: null,
  yield7d360: null,
  yield30d365: null,
  yield30d360: null,
  yield30dCompound365: null,
  yield30dCompound360: null,
  yieldTtm: null,
  sinceInception: null,
  ytd: null,
  volatility30d: null,
  maxDrawdown: null,
  sharpeRatio: null,
};

type PriceMap = Map<string, number>;
type MaxDdMap = Map<string, number>;

function formatDateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateUTC(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00.000Z");
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = parseDateUTC(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateUTC(d);
}

/**
 * Determines the NAV date for a snapshot.
 * Only trusts `tokenPriceComputedAt` for triggers that actually set it (UpdatePricePoolPerShare).
 * All other triggers (including UpdateShareClass) default to the block timestamp.
 */
function getNavDate(snap: { trigger: string; tokenPriceComputedAt: Date | null; timestamp: Date }): string {
  if (TRIGGERS_WITH_COMPUTED_AT.includes(snap.trigger) && snap.tokenPriceComputedAt) {
    return formatDateUTC(snap.tokenPriceComputedAt);
  }
  return formatDateUTC(snap.timestamp);
}

/**
 * Build a contiguous daily LOCF price map from snapshots.
 * Snapshots sorted by (navDate asc, timestamp asc); last entry per navDate wins.
 */
function buildDailyPriceMap(
  snapshots: Array<{ navDate: string; tokenPrice: bigint }>,
  upToDate: string
): PriceMap {
  if (snapshots.length === 0) return new Map();

  const byDate = new Map<string, number>();
  for (const snap of snapshots) {
    byDate.set(snap.navDate, Number(snap.tokenPrice) / Number(WAD));
  }

  const priceMap: PriceMap = new Map();
  const sortedDates = Array.from(byDate.keys()).sort();
  const firstDate = sortedDates[0];
  if (firstDate === undefined) return priceMap;

  let lastPrice = byDate.get(firstDate)!;
  let day = firstDate;

  while (day <= upToDate) {
    const known = byDate.get(day);
    if (known !== undefined) lastPrice = known;
    priceMap.set(day, lastPrice);
    day = addDaysToDateStr(day, 1);
  }

  return priceMap;
}

function precomputeMaxDrawdownMap(priceMap: PriceMap): MaxDdMap {
  const maxDdMap: MaxDdMap = new Map();
  let peak = 0;
  let runningMaxDd = 0;

  const sortedDates = Array.from(priceMap.keys()).sort();
  for (const date of sortedDates) {
    const price = priceMap.get(date)!;
    if (price > peak) peak = price;
    if (peak > 0) {
      const dd = (price - peak) / peak;
      if (dd < runningMaxDd) runningMaxDd = dd;
    }
    maxDdMap.set(date, runningMaxDd);
  }

  return maxDdMap;
}

function computeMetricsForDate(
  priceMap: PriceMap,
  maxDdMap: MaxDdMap,
  rowDate: string,
  firstSnapshotDate: string
): YieldMetrics {
  const priceToday = priceMap.get(rowDate);
  if (!priceToday || priceToday <= 0) return { ...NULL_METRICS };

  // Period returns
  const price7d = priceMap.get(addDaysToDateStr(rowDate, -7));
  const price30d = priceMap.get(addDaysToDateStr(rowDate, -30));
  const price365d = priceMap.get(addDaysToDateStr(rowDate, -365));

  const r7d = price7d != null && price7d > 0 ? priceToday / price7d - 1 : null;
  const r30d = price30d != null && price30d > 0 ? priceToday / price30d - 1 : null;
  const r365d = price365d != null && price365d > 0 ? priceToday / price365d - 1 : null;

  // Metrics 1-2: 7-day simple
  const yield7d365 = r7d !== null ? r7d * (365 / 7) : null;
  const yield7d360 = r7d !== null ? r7d * (360 / 7) : null;

  // Metrics 3-4: 30-day simple
  const yield30d365 = r30d !== null ? r30d * (365 / 30) : null;
  const yield30d360 = r30d !== null ? r30d * (360 / 30) : null;

  // Metrics 5-6: 30-day compound
  let yield30dCompound365: number | null = null;
  let yield30dCompound360: number | null = null;
  if (r30d !== null && r30d > -1) {
    yield30dCompound365 = Math.pow(1 + r30d, 365 / 30) - 1;
    yield30dCompound360 = Math.pow(1 + r30d, 360 / 30) - 1;
  }

  // Metric 7: TTM (raw 365-day return, no annualization)
  const yieldTtm = r365d;

  // Metric 8: Since inception (CAGR)
  let sinceInception: number | null = null;
  const firstPrice = priceMap.get(firstSnapshotDate);
  const days = Math.round(
    (parseDateUTC(rowDate).getTime() - parseDateUTC(firstSnapshotDate).getTime()) / 86400000
  );
  if (days >= 1 && firstPrice != null && firstPrice > 0) {
    const totalReturn = priceToday / firstPrice - 1;
    if (totalReturn > -1) {
      sinceInception = Math.pow(1 + totalReturn, 365 / days) - 1;
    }
  }

  // Metric 9: YTD
  let ytd: number | null = null;
  const jan1Key = `${rowDate.slice(0, 4)}-01-01`;
  const jan1Price = priceMap.get(jan1Key);
  if (jan1Price != null && jan1Price > 0) {
    ytd = priceToday / jan1Price - 1;
  }

  // Metric 10: 30-day annualized volatility
  let volatility30d: number | null = null;
  const prices: number[] = [];
  for (let i = -30; i <= 0; i++) {
    const p = priceMap.get(addDaysToDateStr(rowDate, i));
    if (p !== undefined) prices.push(p);
  }
  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1]!;
    const curr = prices[i]!;
    if (prev > 0 && curr > 0) {
      logReturns.push(Math.log(curr / prev));
    }
  }
  if (logReturns.length >= 2) {
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance =
      logReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (logReturns.length - 1);
    volatility30d = Math.sqrt(variance) * Math.sqrt(365);
  }

  // Metric 11: Max drawdown
  const maxDrawdown = maxDdMap.get(rowDate) ?? null;

  // Metric 12: Sharpe ratio (Rf = 0%)
  let sharpeRatio: number | null = null;
  if (sinceInception !== null && volatility30d !== null && volatility30d > 0) {
    sharpeRatio = sinceInception / volatility30d;
  }

  return {
    yield7d365,
    yield7d360,
    yield30d365,
    yield30d360,
    yield30dCompound365,
    yield30dCompound360,
    yieldTtm,
    sinceInception,
    ytd,
    volatility30d,
    maxDrawdown,
    sharpeRatio,
  };
}

/**
 * Queries all price-update snapshots for a token and returns them
 * sorted by (navDate asc, timestamp asc).
 */
async function fetchPriceUpdateSnapshots(db: Context["db"]["sql"], tokenId: `0x${string}`) {
  const snapshots = await db
    .select({
      tokenPrice: TokenSnapshot.tokenPrice,
      timestamp: TokenSnapshot.timestamp,
      tokenPriceComputedAt: TokenSnapshot.tokenPriceComputedAt,
      trigger: TokenSnapshot.trigger,
    })
    .from(TokenSnapshot)
    .where(
      and(
        eq(TokenSnapshot.id, tokenId),
        inArray(TokenSnapshot.trigger, PRICE_UPDATE_TRIGGERS)
      )
    )
    .orderBy(TokenSnapshot.timestamp);

  const withNavDate = snapshots
    .filter((s) => s.tokenPrice != null && s.tokenPrice > 0n)
    .map((s) => ({
      navDate: getNavDate(s),
      tokenPrice: s.tokenPrice!,
      timestamp: s.timestamp,
    }));

  withNavDate.sort((a, b) =>
    a.navDate === b.navDate
      ? a.timestamp.getTime() - b.timestamp.getTime()
      : a.navDate < b.navDate
        ? -1
        : 1
  );

  return withNavDate;
}

/**
 * Computes all 12 yield/performance metrics for a token at a given row date.
 */
export async function computeYields(
  db: Context["db"]["sql"],
  tokenId: `0x${string}`,
  currentPrice: bigint,
  rowDate: Date
): Promise<YieldMetrics> {
  if (!currentPrice || currentPrice === 0n) return { ...NULL_METRICS };

  const rowDateStr = formatDateUTC(rowDate);
  const snapshots = await fetchPriceUpdateSnapshots(db, tokenId);
  if (snapshots.length === 0) return { ...NULL_METRICS };

  const firstSnapshotDate = snapshots[0]!.navDate;
  const priceMap = buildDailyPriceMap(snapshots, rowDateStr);
  const maxDdMap = precomputeMaxDrawdownMap(priceMap);

  return computeMetricsForDate(priceMap, maxDdMap, rowDateStr, firstSnapshotDate);
}

/**
 * Recalculates yields for all snapshots affected by a retroactive price correction.
 * Rebuilds the full price map and recomputes from correctedTimestamp onward.
 */
export async function recalculateAffectedYields(
  db: Context["db"]["sql"],
  tokenId: `0x${string}`,
  correctedTimestamp: Date
): Promise<void> {
  const allSnapshots = await fetchPriceUpdateSnapshots(db, tokenId);
  if (allSnapshots.length === 0) return;

  const firstSnapshotDate = allSnapshots[0]!.navDate;
  const lastNavDate = allSnapshots[allSnapshots.length - 1]!.navDate;
  const priceMap = buildDailyPriceMap(allSnapshots, lastNavDate);
  const maxDdMap = precomputeMaxDrawdownMap(priceMap);

  // Recompute all snapshots (any trigger) from correctedTimestamp onward
  const affected = await db
    .select({
      blockNumber: TokenSnapshot.blockNumber,
      trigger: TokenSnapshot.trigger,
      tokenPrice: TokenSnapshot.tokenPrice,
      timestamp: TokenSnapshot.timestamp,
      tokenPriceComputedAt: TokenSnapshot.tokenPriceComputedAt,
    })
    .from(TokenSnapshot)
    .where(and(eq(TokenSnapshot.id, tokenId), gte(TokenSnapshot.timestamp, correctedTimestamp)))
    .orderBy(TokenSnapshot.timestamp);

  for (const snap of affected) {
    if (!snap.tokenPrice || snap.tokenPrice === 0n) continue;

    // Price-update snapshots use navDate; periodic snapshots use block timestamp
    const rowDateStr = PRICE_UPDATE_TRIGGERS.includes(snap.trigger)
      ? getNavDate(snap)
      : formatDateUTC(snap.timestamp);

    const metrics = computeMetricsForDate(priceMap, maxDdMap, rowDateStr, firstSnapshotDate);
    await db
      .update(TokenSnapshot)
      .set(metrics)
      .where(
        and(
          eq(TokenSnapshot.id, tokenId),
          eq(TokenSnapshot.blockNumber, snap.blockNumber),
          eq(TokenSnapshot.trigger, snap.trigger)
        )
      );
  }
}
