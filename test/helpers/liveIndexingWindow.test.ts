import { describe, expect, it } from "vitest";
import {
  isLiveIndexingBlock,
  LIVE_INDEXING_WINDOW_S,
} from "../../src/helpers/liveIndexingWindow";
import { TRANSFER_TX_BUFFER_MAX_AGE_S } from "../../src/helpers/transferTxBuffer";

describe("liveIndexingWindow", () => {
  it("uses a dedicated 30m window for crosschain in-progress (not transfer buffer)", () => {
    expect(LIVE_INDEXING_WINDOW_S).toBe(30 * 60);
    expect(LIVE_INDEXING_WINDOW_S).not.toBe(TRANSFER_TX_BUFFER_MAX_AGE_S);
  });

  it("treats blocks within the live window as live", () => {
    const nowSec = 1_700_000_000;
    const blockTs = nowSec - LIVE_INDEXING_WINDOW_S + 1;
    expect(isLiveIndexingBlock(blockTs, nowSec)).toBe(true);
  });

  it("treats blocks at or beyond the live window as historical", () => {
    const nowSec = 1_700_000_000;
    expect(isLiveIndexingBlock(nowSec - LIVE_INDEXING_WINDOW_S, nowSec)).toBe(false);
    expect(isLiveIndexingBlock(nowSec - LIVE_INDEXING_WINDOW_S - 1, nowSec)).toBe(false);
  });
});
