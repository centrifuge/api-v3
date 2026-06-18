import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  reconcileMessageReceives,
  type MessageReceiveEntry,
} from "../../src/helpers/crosschainReconciliation";
import { CrosschainMessageQueueService } from "../../src/services/CrosschainMessageQueueService";
import { CrosschainMessageService } from "../../src/services/CrosschainMessageService";
import { CrosschainPayloadService } from "../../src/services/CrosschainPayloadService";
import { messageRow, payloadRow, testContext, testEvent } from "../helpers/testContext";

describe("reconcileMessageReceives payload status", () => {
  const messageId = `0x${"22".repeat(32)}` as `0x${string}`;
  const payloadId = `0x${"44".repeat(32)}` as `0x${string}`;
  const receivedAt = new Date("2024-06-02T12:00:00Z");

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("FailMessage refreshes payload status via SQL aggregates", async () => {
    const ctx = testContext();
    const event = testEvent();
    const underpaidAt = new Date("2024-06-01T12:00:00Z");

    const committed = messageRow({
      id: messageId,
      index: 0,
      payloadId,
      payloadIndex: 0,
      preparedAt: null,
      messageType: "Request",
      hash: `0x${"33".repeat(32)}`,
      rawData: "0xdead",
    });

    const incoming: MessageReceiveEntry = {
      source: "incoming",
      status: "fail",
      messageId,
      hash: committed.read().hash,
      fromCentrifugeId: "1",
      toCentrifugeId: "2",
      rawData: "0xdead",
      failReason: `0x${"ff".repeat(32)}`,
      receivedAt,
      receivedAtBlock: 200,
      receivedAtChainId: 1,
      receivedAtTxHash: event.transaction.hash,
    };

    vi.spyOn(CrosschainMessageService, "loadCrosschainMessagesByMessageIds").mockResolvedValue(
      new Map([[messageId, [committed]]])
    );
    vi.spyOn(CrosschainMessageQueueService, "queryFifoForKeys").mockResolvedValue([]);
    vi.spyOn(CrosschainMessageQueueService, "deleteMany").mockResolvedValue(undefined);

    vi.spyOn(CrosschainMessageService, "upsertFacts").mockImplementation(
      async () =>
        messageRow({
          ...committed.read(),
          failedAt: receivedAt,
          payloadId,
          payloadIndex: 0,
        })
    );

    vi.spyOn(CrosschainPayloadService, "get").mockResolvedValue(
      payloadRow({
        id: payloadId,
        index: 0,
        underpaidAt,
        sentAt: underpaidAt,
        deliveredAt: null,
        partiallyFailedAt: null,
        completedAt: null,
      })
    );

    const refreshSpy = vi
      .spyOn(CrosschainPayloadService, "refreshPayloadStatusFromAggregates")
      .mockResolvedValue(undefined);

    await reconcileMessageReceives(ctx, event, [messageId], [incoming]);

    expect(refreshSpy).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ receivedAt }),
      payloadId,
      0,
      { setDeliveredFromAnchor: true }
    );
  });
});
