import { describe, expect, it } from "vitest";
import { decodeMessage } from "../../../src/services/CrosschainMessageService";
import { buildV3RequestMessageBody } from "../support/crosschainFixtures";

type DecodedRequest = {
  poolId: string;
  scId: string;
  assetId: string;
  payload: string;
  decodedPayload?: { type: string; data?: { amount: string } };
};

describe("decodeMessage Request (Bug A: poolId/tokenId on deposit/redeem)", () => {
  const poolId = 42n;
  const scId = `0x${"cd".repeat(16)}` as `0x${string}`;
  const assetId = 99n;

  it("DepositRequest decodes poolId and scId on the outer Request message", () => {
    const body = buildV3RequestMessageBody({
      poolId,
      scId,
      assetId,
      requestType: 1,
    });
    const decoded = decodeMessage("Request", body, "v3") as DecodedRequest | null;
    expect(decoded).not.toBeNull();
    expect(decoded?.poolId).toBe(poolId.toString());
    expect(decoded?.scId).toBe(scId);
    expect(decoded?.assetId).toBe(assetId.toString());
    expect(decoded?.decodedPayload).toEqual(
      expect.objectContaining({ type: "DepositRequest" })
    );
  });

  it("RedeemRequest decodes nested request payload type", () => {
    const body = buildV3RequestMessageBody({
      poolId,
      scId,
      assetId,
      requestType: 2,
    });
    const decoded = decodeMessage("Request", body, "v3") as DecodedRequest | null;
    expect(decoded).not.toBeNull();
    expect(decoded?.decodedPayload).toEqual(
      expect.objectContaining({ type: "RedeemRequest" })
    );
  });

  it("DepositRequest nested payload exposes investor and amount", () => {
    const body = buildV3RequestMessageBody({
      poolId,
      scId,
      assetId,
      requestType: 1,
      amount: 5000n,
    });
    const decoded = decodeMessage("Request", body, "v3") as DecodedRequest | null;
    const nested = decoded?.decodedPayload;
    expect(nested?.type).toBe("DepositRequest");
    expect(nested?.data?.amount).toBe("5000");
  });
});
