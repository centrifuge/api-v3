import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "../..");
const HUB_HANDLERS = join(REPO_ROOT, "src/handlers/hubHandlers.ts");

describe("hub handler multichain ordering policy", () => {
  const src = readFileSync(HUB_HANDLERS, "utf8");

  it("uses isLiveIndexingBlock for in-progress hub handlers", () => {
    expect(src).toContain('import { isLiveIndexingBlock } from "../helpers/liveIndexingWindow"');
    expect(src).toContain('multiMapper("hub:NotifyAssetPrice"');
    expect(src).toMatch(
      /hub:NotifyAssetPrice[\s\S]*?if \(!isLiveIndexingBlock\(event\.block\.timestamp\)\) return/
    );
    expect(src).toMatch(
      /hub:NotifySharePrice[\s\S]*?if \(!isLiveIndexingBlock\(event\.block\.timestamp\)\) return/
    );
    expect(src).toMatch(
      /hub:UpdateVault[\s\S]*?if \(!isLiveIndexingBlock\(event\.block\.timestamp\)\) return/
    );
  });

  it("does not serviceError when Asset is missing for NotifyAssetPrice", () => {
    expect(src).not.toMatch(
      /hub:NotifyAssetPrice[\s\S]*?serviceError\(`Asset not found for assetId/
    );
    expect(src).toMatch(
      /hub:NotifyAssetPrice[\s\S]*?serviceLog\([\s\S]*?skipping NotifyAssetPrice in-progress/
    );
  });

  it("logs instead of erroring for missing Asset on UpdateContract branches", () => {
    expect(src).not.toContain(
      "serviceError(`Asset not found for assetId ${assetId}. Cannot update onramp`"
    );
    expect(src).not.toContain(
      "serviceError(`Asset not found for assetId ${assetId}. Cannot update offramp`"
    );
    expect(src).not.toContain(
      "serviceError(`Asset not found for assetId ${assetId}. Cannot update vault maxReserve`"
    );
    expect(src).toMatch(/skipping onramp in-progress update/);
    expect(src).toMatch(/skipping offramp in-progress update/);
  });
});
