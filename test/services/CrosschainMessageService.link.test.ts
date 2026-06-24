import { describe, expect, it, vi } from "vitest";
import { CrosschainMessageService } from "../../src/services/CrosschainMessageService";
import { messageRow, testContext, testEvent } from "../helpers/testContext";

describe("CrosschainMessageService.getFirstUnlinkedAwaiting (Bug B)", () => {
  it("returns first AwaitingBatchDelivery row without payloadId", () => {
    const prepareRow = messageRow({
      status: "AwaitingBatchDelivery",
      payloadId: null,
      preparedAt: new Date("2024-01-01"),
    });
    expect(CrosschainMessageService.getFirstUnlinkedAwaiting([prepareRow])?.read().index).toBe(0);
  });

  it("returns null for batch-only rows without preparedAt", () => {
    const batchOnlyRow = messageRow({
      status: "AwaitingBatchDelivery",
      payloadId: null,
      preparedAt: null,
    });
    expect(CrosschainMessageService.getFirstUnlinkedAwaiting([batchOnlyRow])).toBeNull();
  });

  it("skips rows that already have payloadId", () => {
    const linkedRow = messageRow({
      status: "AwaitingBatchDelivery",
      payloadId: `0x${"aa".repeat(32)}`,
      payloadIndex: 0,
      preparedAt: new Date("2024-01-01"),
    });
    expect(CrosschainMessageService.getFirstUnlinkedAwaiting([linkedRow])).toBeNull();
  });
});

describe("CrosschainMessageService.linkMessagesToPayload filter", () => {
  it("skips rows without preparedAt", async () => {
    const ctx = testContext();
    const event = testEvent();

    vi.spyOn(CrosschainMessageService, "query").mockResolvedValue([
      messageRow({ preparedAt: null }),
    ] as CrosschainMessageService[]);
    const upsertSpy = vi.spyOn(CrosschainMessageService, "upsertFacts").mockResolvedValue(
      messageRow()
    );

    const result = await CrosschainMessageService.linkMessagesToPayload(
      ctx,
      event,
      [`0x${"22".repeat(32)}`],
      `0x${"44".repeat(32)}`,
      0
    );

    expect(result).toEqual([null, null]);
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
