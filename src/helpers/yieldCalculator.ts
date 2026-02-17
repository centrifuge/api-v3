import type { Context } from "ponder:registry";
import { eq, and, lte, desc, gte } from "drizzle-orm";
import { TokenSnapshot } from "ponder:schema";

const SECONDS_PER_DAY = 86400;
const WAD = 10n ** 18n;

type YieldColumns = {
  yield7d365: bigint | null;
  yield7d360: bigint | null;
  yield30d365: bigint | null;
  yield30d360: bigint | null;
  yieldTtm: bigint | null;
};

/**
 * LOCF (Last Observation Carried Forward) lookup:
 * Finds the most recent token price at or before the given timestamp.
 */
async function lookupPrice(
  db: Context["db"]["sql"],
  tokenId: `0x${string}`,
  atOrBefore: Date
): Promise<bigint | null> {
  const [row] = await db
    .select({ tokenPrice: TokenSnapshot.tokenPrice })
    .from(TokenSnapshot)
    .where(and(eq(TokenSnapshot.id, tokenId), lte(TokenSnapshot.timestamp, atOrBefore)))
    .orderBy(desc(TokenSnapshot.timestamp))
    .limit(1);
  return row?.tokenPrice ?? null;
}

/**
 * Calculates annualized yield from current and reference prices.
 * Returns 18-decimal fixed-point bigint.
 * Formula: ((currentPrice / referencePrice) - 1) * (yearConvention / windowDays)
 * In WAD math: ((currentPrice * WAD / referencePrice) - WAD) * yearConvention / windowDays
 */
function calculateYield(
  currentPrice: bigint,
  referencePrice: bigint,
  windowDays: number,
  yearConvention: number
): bigint {
  if (referencePrice === 0n) return 0n;
  const ratio = (currentPrice * WAD) / referencePrice;
  const periodReturn = ratio - WAD;
  return (periodReturn * BigInt(yearConvention)) / BigInt(windowDays);
}

/**
 * Computes all 5 yield columns for a token at a given timestamp.
 * Returns null for columns that lack sufficient history (cold start).
 */
export async function computeYields(
  db: Context["db"]["sql"],
  tokenId: `0x${string}`,
  currentPrice: bigint,
  timestamp: Date
): Promise<YieldColumns> {
  if (currentPrice === 0n) {
    return { yield7d365: null, yield7d360: null, yield30d365: null, yield30d360: null, yieldTtm: null };
  }

  const ts = timestamp.getTime();
  const date7d = new Date(ts - 7 * SECONDS_PER_DAY * 1000);
  const date30d = new Date(ts - 30 * SECONDS_PER_DAY * 1000);
  const date365d = new Date(ts - 365 * SECONDS_PER_DAY * 1000);

  const [price7d, price30d, price365d] = await Promise.all([
    lookupPrice(db, tokenId, date7d),
    lookupPrice(db, tokenId, date30d),
    lookupPrice(db, tokenId, date365d),
  ]);

  return {
    yield7d365: price7d !== null ? calculateYield(currentPrice, price7d, 7, 365) : null,
    yield7d360: price7d !== null ? calculateYield(currentPrice, price7d, 7, 360) : null,
    yield30d365: price30d !== null ? calculateYield(currentPrice, price30d, 30, 365) : null,
    yield30d360: price30d !== null ? calculateYield(currentPrice, price30d, 30, 360) : null,
    yieldTtm: price365d !== null ? calculateYield(currentPrice, price365d, 365, 365) : null,
  };
}

/**
 * Recalculates yields for all snapshots affected by a retroactive price correction.
 * Scans snapshots in [correctedTimestamp, correctedTimestamp + 365d] since those
 * may use the corrected price as a reference.
 */
export async function recalculateAffectedYields(
  db: Context["db"]["sql"],
  tokenId: `0x${string}`,
  correctedTimestamp: Date
): Promise<void> {
  const from = correctedTimestamp;
  const to = new Date(correctedTimestamp.getTime() + 365 * SECONDS_PER_DAY * 1000);

  const affected = await db
    .select({
      blockNumber: TokenSnapshot.blockNumber,
      trigger: TokenSnapshot.trigger,
      tokenPrice: TokenSnapshot.tokenPrice,
      timestamp: TokenSnapshot.timestamp,
    })
    .from(TokenSnapshot)
    .where(
      and(
        eq(TokenSnapshot.id, tokenId),
        gte(TokenSnapshot.timestamp, from),
        lte(TokenSnapshot.timestamp, to)
      )
    )
    .orderBy(TokenSnapshot.timestamp);

  for (const snap of affected) {
    if (!snap.tokenPrice || snap.tokenPrice === 0n) continue;
    const yields = await computeYields(db, tokenId, snap.tokenPrice, snap.timestamp);
    await db
      .update(TokenSnapshot)
      .set(yields)
      .where(
        and(
          eq(TokenSnapshot.id, tokenId),
          eq(TokenSnapshot.blockNumber, snap.blockNumber),
          eq(TokenSnapshot.trigger, snap.trigger)
        )
      );
  }
}
