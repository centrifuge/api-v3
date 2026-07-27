import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

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

/**
 * Matches the operator-precedence bug fixed in PR #453: a nullish coalescing
 * (`??`) whose fallback is immediately followed by an arithmetic operator
 * (`+ - * / %`) with no closing parenthesis in between. Because `??` binds
 * looser than arithmetic, `a ?? b + c` parses as `a ?? (b + c)`; when `a` is a
 * non-nullish `0n` (the common initialized state), the `??` short-circuits
 * and `c` is silently discarded on every call — freezing accumulators at `0n`.
 *
 * The safe form parenthesizes the coalescing: `(a ?? b) + c`.
 *
 * The regex is anchored on `??` followed by a fallback atom (identifier /
 * dotted access / numeric literal, optionally negated) and then an arithmetic
 * operator, with only whitespace between. A parenthesized expression emits
 * `)` before the operator, so it does not match.
 */
const UNPARENTHESIZED_NULLISH_ARITHMETIC =
  /\?\?[ \t]*-?[\w.]+[ \t]*[+\-*/%](?![ \t]*\*)/;

/**
 * True when a line is a comment (so the regex never flags documentation that
 * describes the bug pattern).
 * @param line - Source line
 * @returns True if the line is a comment
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

describe("nullish coalescing operator precedence (PR #453 regression guard)", () => {
  it("no `?? <fallback> <arith>` accumulator bug remains in src/", () => {
    const hits: string[] = [];
    for (const file of walkTsFiles(SRC)) {
      const src = readFileSync(file, "utf8");
      for (const line of src.split("\n")) {
        if (isCommentLine(line)) continue;
        if (UNPARENTHESIZED_NULLISH_ARITHMETIC.test(line)) {
          hits.push(`${relative(REPO_ROOT, file)}: ${line.trim()}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("regex flags the three original buggy HoldingService lines", () => {
    const buggy = [
      "this.data.assetQuantity = assetQuantity ?? 0n + amount;",
      "this.data.totalValue = totalValue ?? 0n + increaseValue;",
      "this.data.assetQuantity = assetQuantity ?? 0n - amount;",
      "this.data.totalValue = totalValue ?? 0n - decreaseValue;",
      "this.data.totalValue = totalValue ?? 0n + (isPositive ? diffValue : -diffValue);",
    ];
    for (const line of buggy) {
      expect(UNPARENTHESIZED_NULLISH_ARITHMETIC.test(line)).toBe(true);
    }
  });

  it("regex does not flag the parenthesized fix", () => {
    const safe = [
      "this.data.assetQuantity = (assetQuantity ?? 0n) + amount;",
      "this.data.totalValue = (totalValue ?? 0n) + increaseValue;",
      "this.data.assetQuantity = (assetQuantity ?? 0n) - amount;",
      "this.data.totalValue = (totalValue ?? 0n) - decreaseValue;",
      "this.data.totalValue = (totalValue ?? 0n) + (isPositive ? diffValue : -diffValue);",
      "const cumulativeEarningsAfter = cumulativeEarningsBefore + (periodEarnings ?? 0n);",
      "return (result?.maxIndex ?? -1) + 1;",
      "return instances.reduce((sum, instance) => sum + (instance.read().totalIssuance ?? 0n), 0n);",
    ];
    for (const line of safe) {
      expect(UNPARENTHESIZED_NULLISH_ARITHMETIC.test(line)).toBe(false);
    }
  });
});
