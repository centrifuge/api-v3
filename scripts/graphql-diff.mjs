#!/usr/bin/env node
/**
 * GraphQL parity diff for multichain migration.
 * Usage: node scripts/graphql-diff.mjs <baseline.json> <candidate.json>
 */
import { readFileSync } from "node:fs";

const [baselinePath, candidatePath] = process.argv.slice(2);
if (!baselinePath || !candidatePath) {
  console.error("Usage: graphql-diff.mjs <baseline.json> <candidate.json>");
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));

function deepDiff(a, b, path = "") {
  const diffs = [];
  if (typeof a !== typeof b) {
    diffs.push(`${path}: type ${typeof a} vs ${typeof b}`);
    return diffs;
  }
  if (a === null || b === null || typeof a !== "object") {
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    return diffs;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) diffs.push(`${path}.length: ${a.length} vs ${b.length}`);
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) diffs.push(...deepDiff(a[i], b[i], `${path}[${i}]`));
    return diffs;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    diffs.push(...deepDiff(a[k], b[k], path ? `${path}.${k}` : k));
  }
  return diffs;
}

const diffs = deepDiff(baseline, candidate);
if (diffs.length === 0) {
  console.log("Parity OK — no differences");
  process.exit(0);
}
console.error(`Parity FAIL — ${diffs.length} difference(s):`);
for (const d of diffs.slice(0, 50)) console.error(`  ${d}`);
if (diffs.length > 50) console.error(`  ... and ${diffs.length - 50} more`);
process.exit(1);
