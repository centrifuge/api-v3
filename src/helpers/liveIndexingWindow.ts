/** Wall-clock seconds for crosschain in-progress UX near chain tip. */
export const LIVE_INDEXING_WINDOW_S = 30 * 60;

/**
 * True when the block is within the live crosschain in-progress window (near chain tip vs wall clock).
 * Historical backfill blocks skip crosschainInProgress writes.
 * @param blockTimestamp - Ponder event block timestamp (seconds)
 * @param nowSec - Wall clock seconds (defaults to Date.now() / 1000)
 */
export function isLiveIndexingBlock(
  blockTimestamp: bigint | number,
  nowSec: number = Math.floor(Date.now() / 1000)
): boolean {
  return nowSec - Number(blockTimestamp) < LIVE_INDEXING_WINDOW_S;
}

/**
 * Runs `fn` only for blocks within the live indexing window.
 * @param blockTimestamp - Ponder event block timestamp (seconds)
 * @param fn - Side effect (typically setCrosschainInProgress)
 */
export async function applyCrosschainInProgressIfLive(
  blockTimestamp: bigint | number,
  fn: () => void | Promise<void>
): Promise<void> {
  if (!isLiveIndexingBlock(blockTimestamp)) return;
  await fn();
}
