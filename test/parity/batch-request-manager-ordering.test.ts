import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "../..");
const BATCH_HANDLERS = join(REPO_ROOT, "src/handlers/batchRequestManagerHandlers.ts");

describe("batch request manager within-chain ordering policy", () => {
  const src = readFileSync(BATCH_HANDLERS, "utf8");

  it("does not gate approveDeposits on Asset rows", () => {
    expect(src).not.toContain(
      "Asset not found assetId=${depositAssetId}. Cannot compute approved percentage for invest order"
    );
    expect(src).toMatch(
      /approveDeposits[\s\S]*?EpochInvestOrderService\.upsert/
    );
  });

  it("does not gate approveRedeems on pool currency", () => {
    expect(src).not.toContain(
      "Pool not found. Cannot retrieve currency to compute approved percentage for redeem order"
    );
    expect(src).not.toContain("Currency not found. Cannot compute approved percentage for redeem order");
    expect(src).toMatch(/approveRedeems[\s\S]*?EpochRedeemOrderService\.upsert/);
  });

  it("uses getOrInit for epoch aggregates on issue and revoke", () => {
    expect(src).not.toContain("EpochInvestOrder not found. Cannot record issued shares");
    expect(src).toMatch(/issueShares[\s\S]*?EpochInvestOrderService\.getOrInit/);
    expect(src).toMatch(/revokeShares[\s\S]*?EpochRedeemOrderService\.getOrInit/);
  });

  it("reads persisted decimals for per-investor epoch math", () => {
    expect(src).toContain("readEpochInvestorDecimals");
    expect(src).not.toContain("Asset not found assetId=${depositAssetId}. Cannot compute issued shares");
    expect(src).not.toContain("Token not found tokenId=${tokenId}. Cannot compute issued shares");
    expect(src).not.toContain("Asset not found assetId=${payoutAssetId}. Cannot compute revoked shares");
    expect(src).not.toContain("Token not found tokenId=${tokenId}. Cannot compute revoked shares");
  });
});
