import type { Context, Event } from "ponder:registry";
import { serviceError } from "./logger";
import { isUserAccount } from "./userAccount";

/**
 * Milliseconds without a new leg before an open batch is eligible for idle flush.
 * Idle flush runs only inside handler callbacks (never from a background timer).
 */
export const TRANSFER_TX_IDLE_MS = 5_000;

/** Net-delta buffering applies only to transfers older than this many seconds (wall clock). */
export const TRANSFER_TX_BUFFER_MAX_AGE_S = 8 * 60 * 60;

/** One ERC-20 Transfer leg within a transaction. */
export type TransferLeg = {
  from: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
  logIndex: number;
};

/** Ponder Transfer event shape used by the tokenInstance handler. */
export type TransferEvent = Extract<
  Event,
  { transaction: { hash: `0x${string}` }; log: { logIndex: number } }
> & {
  args: { from: `0x${string}`; to: `0x${string}`; value: bigint };
  log: { address: `0x${string}`; logIndex: number };
};

/** Buffered legs for one share token contract within a single transaction. */
export type TransferTxBatch = {
  chainId: number;
  txHash: `0x${string}`;
  blockNumber: number;
  tokenAddress: `0x${string}`;
  legs: TransferLeg[];
  anchorEvent: TransferEvent;
  lastLegAppendedAt: number;
};

const batches = new Map<string, TransferTxBatch>();
const openTxByChain = new Map<number, `0x${string}` | undefined>();
const openBlockByChain = new Map<number, number | undefined>();
const flushingKeys = new Set<string>();

/**
 * Builds the in-memory batch key for a chain, transaction, and token contract.
 */
export function transferTxBatchKey(
  chainId: number,
  txHash: `0x${string}`,
  tokenAddress: `0x${string}`
): string {
  return `${chainId}:${txHash}:${tokenAddress.toLowerCase()}`;
}

/**
 * Aggregates per-address net token deltas for all legs in a batch.
 */
export function computeNetDeltas(legs: TransferLeg[]): Map<string, bigint> {
  const net = new Map<string, bigint>();

  for (const { from, to, amount } of legs) {
    if (BigInt(from) !== 0n) {
      const key = from.toLowerCase();
      net.set(key, (net.get(key) ?? 0n) - amount);
    }
    if (BigInt(to) !== 0n) {
      const key = to.toLowerCase();
      net.set(key, (net.get(key) ?? 0n) + amount);
    }
  }

  return net;
}

/**
 * Returns the maximum log index among buffered legs (checkpoint PK).
 */
export function maxLogIndex(legs: TransferLeg[]): number {
  if (legs.length === 0) return 0;
  return Math.max(...legs.map((leg) => leg.logIndex));
}

/**
 * True when the batch may mutate DB state (mint/burn or a tracked user side).
 */
export function batchNeedsWork(chainId: number, legs: TransferLeg[]): boolean {
  for (const { from, to } of legs) {
    if (BigInt(from) === 0n || BigInt(to) === 0n) return true;
    if (isUserAccount(chainId, from) || isUserAccount(chainId, to)) return true;
  }
  return false;
}

/**
 * True when the transfer should use same-tx net-delta buffering (historical backfill only).
 * Disabled for blocks within the last {@link TRANSFER_TX_BUFFER_MAX_AGE_S} wall-clock seconds.
 */
export function usesTransferTxBuffer(
  blockTimestamp: bigint | number,
  nowSec: number = Math.floor(Date.now() / 1000)
): boolean {
  return nowSec - Number(blockTimestamp) >= TRANSFER_TX_BUFFER_MAX_AGE_S;
}

/**
 * Flushes and removes a single batch by key using the active handler context.
 */
async function flushBatchByKey(context: Context, key: string): Promise<void> {
  if (flushingKeys.has(key)) return;
  const batch = batches.get(key);
  if (!batch) return;
  if (batch.chainId !== context.chain.id) return;

  flushingKeys.add(key);
  batches.delete(key);
  try {
    const { applyTransferTxBatch } = await import("./applyTransferTxBatch");
    await applyTransferTxBatch(context, batch);
  } finally {
    flushingKeys.delete(key);
  }
}

/**
 * Flushes all batches for a chain and transaction hash.
 */
async function flushTx(
  context: Context,
  chainId: number,
  txHash: `0x${string}`
): Promise<void> {
  const prefix = `${chainId}:${txHash}:`;
  const keys = [...batches.keys()].filter((key) => key.startsWith(prefix));
  for (const key of keys) {
    await flushBatchByKey(context, key);
  }
}

/**
 * Flushes all batches on a chain with block number strictly less than `blockNumber`.
 */
async function flushBlocksBefore(
  context: Context,
  chainId: number,
  blockNumber: number
): Promise<void> {
  const keys = [...batches.entries()]
    .filter(([, batch]) => batch.chainId === chainId && batch.blockNumber < blockNumber)
    .map(([key]) => key);
  for (const key of keys) {
    await flushBatchByKey(context, key);
  }
}

/**
 * Flushes idle batches for the handler's chain (handler context only — no background timer).
 */
export async function flushIdleBatches(
  context: Context,
  idleMs: number = TRANSFER_TX_IDLE_MS
): Promise<void> {
  const chainId = context.chain.id;
  const now = Date.now();
  const keys = [...batches.entries()]
    .filter(([, batch]) => batch.chainId === chainId && now - batch.lastLegAppendedAt >= idleMs)
    .map(([key]) => key);
  for (const key of keys) {
    await flushBatchByKey(context, key);
  }
}

/**
 * Flushes all open batches on a chain (e.g. when entering the live window).
 */
async function flushAllOpenBatchesForChain(context: Context, chainId: number): Promise<void> {
  const keys = [...batches.entries()]
    .filter(([, batch]) => batch.chainId === chainId)
    .map(([key]) => key);
  for (const key of keys) {
    await flushBatchByKey(context, key);
  }
}

/**
 * Applies one Transfer leg immediately (no buffering).
 */
async function applyImmediateTransferLeg(
  context: Context,
  event: TransferEvent,
  txHash: `0x${string}`,
  leg: TransferLeg
): Promise<void> {
  const { applyTransferTxBatch } = await import("./applyTransferTxBatch");
  await applyTransferTxBatch(context, {
    chainId: context.chain.id,
    txHash,
    blockNumber: Number(event.block.number),
    tokenAddress: event.log.address,
    legs: [leg],
    anchorEvent: event,
    lastLegAppendedAt: Date.now(),
  });
}

/**
 * Appends a Transfer leg, running flush triggers before buffering.
 * All DB writes happen synchronously within this handler invocation.
 */
export async function appendTransferLeg(context: Context, event: TransferEvent): Promise<void> {
  const txHash = event.transaction?.hash;
  if (!txHash) {
    serviceError("tokenInstance:Transfer missing transaction hash");
    return;
  }

  const chainId = context.chain.id;
  const blockNumber = Number(event.block.number);
  const tokenAddress = event.log.address;
  const { from, to, value: amount } = event.args;

  const leg: TransferLeg = {
    from,
    to,
    amount,
    logIndex: event.log.logIndex,
  };

  if (!usesTransferTxBuffer(event.block.timestamp)) {
    await flushIdleBatches(context, TRANSFER_TX_IDLE_MS);

    const prevTx = openTxByChain.get(chainId);
    if (prevTx !== undefined && prevTx !== txHash) {
      await flushTx(context, chainId, prevTx);
    }

    const prevBlock = openBlockByChain.get(chainId);
    if (prevBlock !== undefined && blockNumber > prevBlock) {
      await flushBlocksBefore(context, chainId, blockNumber);
    }

    await flushAllOpenBatchesForChain(context, chainId);
    await applyImmediateTransferLeg(context, event, txHash, leg);
    openTxByChain.set(chainId, txHash);
    openBlockByChain.set(chainId, blockNumber);
    return;
  }

  await flushIdleBatches(context, TRANSFER_TX_IDLE_MS);

  const prevTx = openTxByChain.get(chainId);
  if (prevTx !== undefined && prevTx !== txHash) {
    await flushTx(context, chainId, prevTx);
  }

  const prevBlock = openBlockByChain.get(chainId);
  if (prevBlock !== undefined && blockNumber > prevBlock) {
    await flushBlocksBefore(context, chainId, blockNumber);
  }

  const key = transferTxBatchKey(chainId, txHash, tokenAddress);

  const existing = batches.get(key);
  if (existing) {
    existing.legs.push(leg);
    existing.anchorEvent = event;
    existing.lastLegAppendedAt = Date.now();
  } else {
    batches.set(key, {
      chainId,
      txHash,
      blockNumber,
      tokenAddress,
      legs: [leg],
      anchorEvent: event,
      lastLegAppendedAt: Date.now(),
    });
  }

  openTxByChain.set(chainId, txHash);
  openBlockByChain.set(chainId, blockNumber);
}
