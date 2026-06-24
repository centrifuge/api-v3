import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "../..");
const BALANCE_SHEET_HANDLERS = join(REPO_ROOT, "src/handlers/balanceSheetHandlers.ts");
const TOKEN_ISSUANCE_SERVICE = join(REPO_ROOT, "src/services/TokenIssuanceService.ts");

describe("balance sheet token issuance multichain ordering policy", () => {
  const handlers = readFileSync(BALANCE_SHEET_HANDLERS, "utf8");
  const service = readFileSync(TOKEN_ISSUANCE_SERVICE, "utf8");

  it("registers Issue/Revoke via multiMapper with v3 ABI guard", () => {
    expect(handlers).toMatch(/multiMapper\("balanceSheet:Issue", recordIssue\)/);
    expect(handlers).toMatch(/multiMapper\("balanceSheet:Revoke", recordRevoke\)/);
    expect(handlers).not.toMatch(/ponder\.on\("balanceSheetV3_1:Issue"/);
    expect(handlers).not.toMatch(/ponder\.on\("balanceSheetV3_1:Revoke"/);
    expect(handlers).toMatch(/recordIssue[\s\S]*?if \(!\("sender" in event\.args\)\) return/);
    expect(handlers).toMatch(/recordRevoke[\s\S]*?if \(!\("sender" in event\.args\)\) return/);
  });

  it("does not gate token issuance on Token, Pool, or Asset rows", () => {
    expect(handlers).not.toMatch(/recordIssue[\s\S]*?TokenService/);
    expect(handlers).not.toMatch(/recordRevoke[\s\S]*?TokenService/);
    expect(handlers).not.toMatch(/recordIssue[\s\S]*?PoolService/);
    expect(handlers).not.toMatch(/recordRevoke[\s\S]*?AssetService/);
    expect(handlers).not.toMatch(/recordIssue[\s\S]*?serviceError/);
    expect(handlers).not.toMatch(/recordRevoke[\s\S]*?serviceError/);
  });

  it("derives isManual from registry addresses on the processing chain only", () => {
    expect(handlers).toMatch(/isFlowMinter\(chainId, sender\)/);
    expect(handlers).toMatch(/getContractNameForAddress\(chainId, sender\)/);
    expect(handlers).toMatch(/FLOW_MINTERS/);
    expect(handlers).not.toMatch(/getContractAddressesForChain/);
    expect(handlers).not.toMatch(/recordIssue[\s\S]*?CrosschainMessage/);
    expect(handlers).not.toMatch(/recordRevoke[\s\S]*?CrosschainMessage/);
  });

  it("uses append-only insert with logIndex in the natural key", () => {
    expect(handlers).toMatch(/logIndex: event\.log\.logIndex/);
    expect(service).toMatch(/this\.insert\(context/);
    expect(service).not.toMatch(/saveMany|upsert|getOrInit/);
  });
});
