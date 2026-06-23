import { describe, expect, it } from "vitest";
import { registerProtocolAddress } from "../../src/helpers/protocolAddresses";
import {
  batchNeedsWork,
  computeNetDeltas,
  maxLogIndex,
  shouldFlushBufferedBatchAfterLeg,
  usesTransferTxBuffer,
  TRANSFER_TX_BUFFER_MAX_AGE_S,
  type TransferLeg,
} from "../../src/helpers/transferTxBuffer";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`;
const C = "0xcccccccccccccccccccccccccccccccccccccccc" as `0x${string}`;
const R = "0xdddddddddddddddddddddddddddddddddddddddd" as `0x${string}`;
const USER = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as `0x${string}`;
const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;

const CHAIN_ID = 8453;

/** Builds a transfer leg for unit tests. */
function leg(
  from: `0x${string}`,
  to: `0x${string}`,
  amount: bigint,
  logIndex = 0
): TransferLeg {
  return { from, to, amount, logIndex };
}

describe("computeNetDeltas", () => {
  it("single leg A to B", () => {
    const net = computeNetDeltas([leg(A, B, 100n)]);
    expect(net.get(A.toLowerCase())).toBe(-100n);
    expect(net.get(B.toLowerCase())).toBe(100n);
  });

  it("3-hop swap returns all zero nets", () => {
    const amount = 2995509999048761176937n;
    const net = computeNetDeltas([
      leg(A, R, amount, 0),
      leg(R, C, amount, 1),
      leg(C, A, amount, 2),
    ]);
    expect(net.get(A.toLowerCase())).toBe(0n);
    expect(net.get(R.toLowerCase())).toBe(0n);
    expect(net.get(C.toLowerCase())).toBe(0n);
  });

  it("mint 0 to user", () => {
    const net = computeNetDeltas([leg(ZERO, USER, 50n)]);
    expect(net.get(USER.toLowerCase())).toBe(50n);
    expect(net.has(ZERO.toLowerCase())).toBe(false);
  });

  it("round-trip A to R to A with slippage", () => {
    const net = computeNetDeltas([leg(A, R, 100n, 0), leg(R, A, 99n, 1)]);
    expect(net.get(A.toLowerCase())).toBe(-1n);
    expect(net.get(R.toLowerCase())).toBe(1n);
  });
});

describe("maxLogIndex", () => {
  it("returns highest log index", () => {
    expect(maxLogIndex([leg(A, B, 1n, 2), leg(B, C, 1n, 7)])).toBe(7);
  });
});

describe("usesTransferTxBuffer", () => {
  const nowSec = 1_700_000_000;

  it("true when block is older than 8h", () => {
    expect(usesTransferTxBuffer(nowSec - TRANSFER_TX_BUFFER_MAX_AGE_S - 1, nowSec)).toBe(true);
  });

  it("false when block is within the last 8h", () => {
    expect(usesTransferTxBuffer(nowSec - 3600, nowSec)).toBe(false);
  });
});

describe("shouldFlushBufferedBatchAfterLeg", () => {
  it("true for burn legs", () => {
    expect(shouldFlushBufferedBatchAfterLeg(leg(USER, ZERO, 1n))).toBe(true);
  });

  it("false for mint and ordinary transfers", () => {
    expect(shouldFlushBufferedBatchAfterLeg(leg(ZERO, USER, 1n))).toBe(false);
    expect(shouldFlushBufferedBatchAfterLeg(leg(USER, A, 1n))).toBe(false);
  });
});

describe("batchNeedsWork", () => {
  it("false for protocol to protocol only", () => {
    const p1 = "0x0101010101010101010101010101010101010101" as `0x${string}`;
    const p2 = "0x0202020202020202020202020202020202020202" as `0x${string}`;
    registerProtocolAddress(CHAIN_ID, p1);
    registerProtocolAddress(CHAIN_ID, p2);
    expect(batchNeedsWork(CHAIN_ID, [leg(p1, p2, 1n)])).toBe(false);
  });

  it("true when mint leg present", () => {
    expect(batchNeedsWork(CHAIN_ID, [leg(ZERO, USER, 1n)])).toBe(true);
  });

  it("true when a random EOA is involved", () => {
    expect(batchNeedsWork(CHAIN_ID, [leg(USER, A, 1n)])).toBe(true);
  });
});
