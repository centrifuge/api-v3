import { vi } from "vitest";
import type { Context, Event } from "ponder:registry";
import { CrosschainMessage, CrosschainPayload } from "ponder:schema";
import { CrosschainMessageService } from "../../src/services/CrosschainMessageService";
import { CrosschainPayloadService } from "../../src/services/CrosschainPayloadService";
import type { MockDb } from "./mockDb";

const TX_HASH = `0x${"ab".repeat(32)}` as `0x${string}`;
const NOW = new Date("2024-06-01T12:00:00Z");

/**
 * Minimal Ponder context wired to an optional Drizzle mock `db`.
 */
export function testContext(db?: MockDb): Context {
  return {
    db: { sql: db ?? ({} as MockDb), find: vi.fn() },
    client: null,
    chain: { id: 1, name: "ethereum" },
  } as unknown as Context;
}

/**
 * Minimal tx-bearing handler event for service upserts.
 */
export function testEvent(
  overrides: Partial<Extract<Event, { transaction: { hash: `0x${string}` } }>> = {}
): Extract<Event, { transaction: { hash: `0x${string}` } }> {
  return {
    block: { timestamp: BigInt(Math.floor(NOW.getTime() / 1000)), number: 100n },
    transaction: { hash: TX_HASH },
    log: { logIndex: 0, address: `0x${"00".repeat(20)}` as `0x${string}` },
    args: {},
    ...overrides,
  } as unknown as Extract<Event, { transaction: { hash: `0x${string}` } }>;
}

const nullChainTimestamps = {
  failedAt: null,
  failedAtBlock: null,
  failedAtTxHash: null,
  failedAtChainId: null,
  executedAt: null,
  executedAtBlock: null,
  executedAtTxHash: null,
  executedAtChainId: null,
};

/**
 * Builds a `CrosschainMessageService` instance for unit tests.
 */
export function messageRow(
  overrides: Partial<typeof CrosschainMessage.$inferSelect> = {}
): CrosschainMessageService {
  const ctx = testContext();
  const base = {
    id: `0x${"22".repeat(32)}`,
    index: 0,
    poolId: null,
    tokenId: null,
    payloadId: null,
    payloadIndex: null,
    messageType: "Request",
    status: "AwaitingBatchDelivery" as const,
    hash: `0x${"33".repeat(32)}`,
    rawData: "0x",
    data: null,
    failReason: null,
    fromCentrifugeId: "1",
    toCentrifugeId: "2",
    preparedAt: NOW,
    preparedAtBlock: 100,
    preparedAtTxHash: TX_HASH,
    preparedAtChainId: 1,
    ...nullChainTimestamps,
    createdAt: NOW,
    createdAtBlock: 100,
    createdAtTxHash: TX_HASH,
  } satisfies typeof CrosschainMessage.$inferSelect;

  return new CrosschainMessageService(CrosschainMessage, "CrosschainMessage", ctx, {
    ...base,
    ...overrides,
  });
}

/**
 * Builds a `CrosschainPayloadService` instance for unit tests.
 */
export function payloadRow(
  overrides: Partial<typeof CrosschainPayload.$inferSelect> = {}
): CrosschainPayloadService {
  const ctx = testContext();
  const base = {
    id: `0x${"44".repeat(32)}`,
    index: 0,
    fromCentrifugeId: "1",
    toCentrifugeId: "2",
    rawData: "0x",
    poolId: null,
    tokenId: null,
    status: "InTransit" as const,
    gasLimit: null,
    gasPrice: null,
    deliveredAt: null,
    deliveredAtBlock: null,
    deliveredAtTxHash: null,
    completedAt: null,
    completedAtBlock: null,
    completedAtTxHash: null,
    underpaidAt: NOW,
    underpaidAtBlock: 100,
    underpaidAtTxHash: TX_HASH,
    underpaidAtChainId: 1,
    sentAt: NOW,
    sentAtBlock: 100,
    sentAtTxHash: TX_HASH,
    sentAtChainId: 1,
    partiallyFailedAt: null,
    partiallyFailedAtBlock: null,
    partiallyFailedAtTxHash: null,
    partiallyFailedAtChainId: null,
    createdAt: NOW,
    createdAtBlock: 100,
    createdAtTxHash: TX_HASH,
  } satisfies typeof CrosschainPayload.$inferSelect;

  return new CrosschainPayloadService(CrosschainPayload, "CrosschainPayload", ctx, {
    ...base,
    ...overrides,
  });
}
