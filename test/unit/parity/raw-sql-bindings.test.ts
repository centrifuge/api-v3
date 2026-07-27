import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { PG_TYPED_BIND_HELPERS } from "../../../src/helpers/sqlSafety";

const REPO_ROOT = join(import.meta.dirname, "../../..");
const SRC = join(REPO_ROOT, "src");

/**
 * Recursively lists `.ts` files under a directory.
 * @param dir - Root directory
 * @returns Absolute file paths
 */
function walkTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkTsFiles(path);
    if (entry.name.endsWith(".ts")) return [path];
    return [];
  });
}

describe("raw SQL binding policy", () => {
  it("only CrosschainPayloadService executes parameterized raw SQL", () => {
    const hits: string[] = [];
    for (const file of walkTsFiles(SRC)) {
      const src = readFileSync(file, "utf8");
      if (src.includes("context.db.sql.execute") || src.includes("db.sql.execute")) {
        hits.push(relative(REPO_ROOT, file));
      }
    }
    expect(hits.sort()).toEqual(["src/services/CrosschainPayloadService.ts"]);
  });

  it("exports typed bind helpers for every Ponder primitive used in raw SQL", () => {
    const src = readFileSync(join(SRC, "helpers/sqlSafety.ts"), "utf8");
    for (const helper of PG_TYPED_BIND_HELPERS) {
      expect(src).toContain(`export function ${helper}`);
    }
  });

  it("refreshPayloadStatusSql never embeds raw JS values in sql templates", () => {
    const src = readFileSync(join(SRC, "services/crosschainStatusSql.ts"), "utf8");
    const forbidden = [
      /\$\{anchor\.receivedAt\}/,
      /\$\{anchor\.receivedAtBlock\}/,
      /\$\{anchor\.receivedAtChainId\}/,
      /\$\{anchor\.receivedAtTxHash\}/,
      /\$\{payloadId\}/,
      /\$\{payloadIndex\}/,
      /decode\(substring/,
      /\bstatus\s*=\s*\$\{/,
    ];
    for (const pattern of forbidden) {
      expect(src, String(pattern)).not.toMatch(pattern);
    }
    expect(src).toContain("bindPgTimestamp");
    expect(src).toContain("bindPgInteger");
    expect(src).toContain("bindPgHexBytes32");
  });

  it("sqlSafety is the only module that may CAST bound params for raw SQL", () => {
    const offenders: string[] = [];
    for (const file of walkTsFiles(SRC)) {
      const rel = relative(REPO_ROOT, file);
      if (rel === "src/helpers/sqlSafety.ts") continue;
      const src = readFileSync(file, "utf8");
      if (/\bsql`[\s\S]*?CAST\s*\(\s*\$\{/.test(src)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
