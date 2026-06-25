#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { formatSmokePrComment } from "../lib/report.mjs";

/**
 * @param {string} filePath
 */
async function readReport(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node test/smoke/ci/format-pr-comment.mjs <report.json> [...]");
  process.exit(2);
}

/** @type {import('./lib/report.mjs').SmokeReport[]} */
const reports = [];
for (const file of files) {
  try {
    reports.push(await readReport(file));
  } catch (err) {
    const region = file.match(/smoke-report-([a-z]+)\.json$/i)?.[1] ?? "unknown";
    reports.push({
      region,
      graphqlUrl: "",
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      ranAt: new Date().toISOString(),
      smokes: [],
      totalChecked: 0,
      totalSkipped: 0,
      totalMismatches: 0,
    });
  }
}

const meta = {
  workflowUrl: process.env.GITHUB_WORKFLOW_URL,
  commitSha: process.env.GITHUB_SHA,
};

process.stdout.write(`${formatSmokePrComment(reports, meta)}\n`);
