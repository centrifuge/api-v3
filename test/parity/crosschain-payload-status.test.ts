import { describe, expect, it } from "vitest";
import { CrosschainMessageService } from "../../src/services/CrosschainMessageService";
import {
  messageStatusSetSql,
  payloadSimpleStatusSetSql,
} from "../../src/services/crosschainStatusSql";

/** Thin wrapper around `CrosschainMessageService.aggregatePoolAndTokenFromRows`. */
function aggregatePoolAndTokenFromRows(
  rows: readonly { poolId: bigint | null; tokenId: `0x${string}` | null }[]
): [poolId: bigint | null, tokenId: `0x${string}` | null] {
  return CrosschainMessageService.aggregatePoolAndTokenFromRows(
    rows.map((row) => ({ read: () => row }))
  );
}

describe("crosschain status SQL builders", () => {
  it("exports message status CASE without Unsent branch", () => {
    const sqlObj = messageStatusSetSql();
    const sqlText = JSON.stringify(sqlObj);
    expect(sqlText).toContain("AwaitingBatchDelivery");
    expect(sqlText).not.toContain("Unsent");
  });

  it("exports payload simple status CASE with sentAt and underpaidAt", () => {
    const sqlText = JSON.stringify(payloadSimpleStatusSetSql());
    expect(sqlText).toContain("sent_at");
    expect(sqlText).toContain("underpaid_at");
  });
});

describe("aggregatePoolAndTokenFromRows", () => {
  it("aggregates a single pool and token from linked rows", () => {
    const [poolId, tokenId] = aggregatePoolAndTokenFromRows([
      { poolId: 1n, tokenId: "0x01" },
      { poolId: 1n, tokenId: "0x02" },
    ]);
    expect(poolId).toBe(1n);
    expect(tokenId).toBe("0x02");
  });

  it("returns null pair when multiple pools are present", () => {
    const [poolId, tokenId] = aggregatePoolAndTokenFromRows([
      { poolId: 1n, tokenId: null },
      { poolId: 2n, tokenId: null },
    ]);
    expect(poolId).toBeNull();
    expect(tokenId).toBeNull();
  });

  it("propagates prepare-row pool/token for UnderpaidBatch link path", () => {
    const [poolId, tokenId] = aggregatePoolAndTokenFromRows([
      { poolId: 42n, tokenId: "0xabcd" as `0x${string}` },
    ]);
    expect(poolId).toBe(42n);
    expect(tokenId).toBe("0xabcd");
  });
});
