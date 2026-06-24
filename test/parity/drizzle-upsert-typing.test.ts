import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(import.meta.dirname, "../../src");

/** Recursively lists `.ts` files under `dir`. */
function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listTsFiles(path));
      continue;
    }
    if (entry.endsWith(".ts")) files.push(path);
  }
  return files;
}

describe("drizzle upsert typing policy", () => {
  it("src/ has no as unknown as casts", () => {
    const offenders = listTsFiles(SRC_ROOT).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return text.includes("as unknown as") ? [file.replace(`${SRC_ROOT}/`, "src/")] : [];
    });
    expect(offenders).toEqual([]);
  });
});
