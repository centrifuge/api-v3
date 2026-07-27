import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "../../..");
const VAULT_HANDLERS = join(REPO_ROOT, "src/handlers/vaultHandlers.ts");

describe("vault handler multichain ordering policy", () => {
  const src = readFileSync(VAULT_HANDLERS, "utf8");

  it("does not require Token rows for deposit or redeem request handlers", () => {
    expect(src).not.toContain("TokenService");
    expect(src).not.toMatch(/vault:DepositRequest[\s\S]*?TokenService\.get/);
    expect(src).not.toMatch(/vault:RedeemRequest[\s\S]*?TokenService\.get/);
    expect(src).not.toContain("Token not found. Cannot retrieve token configuration");
  });

  it("continues deposit request indexing when TokenInstance is missing", () => {
    expect(src).toMatch(
      /vault:DepositRequest[\s\S]*?TokenInstance not found for deposit request[\s\S]*?skipping position init/
    );
    expect(src).toMatch(
      /vault:DepositRequest[\s\S]*?InvestorTransactionService\.updateDepositRequest/
    );
    expect(src).toMatch(/vault:DepositRequest[\s\S]*?vaultInvestOrder\.depositRequest/);
    expect(src).not.toMatch(
      /vault:DepositRequest[\s\S]*?TokenInstance not found\. Cannot initialize position/
    );
  });
});
