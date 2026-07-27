#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { buildSmokeReport } from "../lib/report.mjs";

/**
 * @param {string} filePath
 * @param {ConstructorParameters<typeof buildSmokeReport>[0]} input
 */
export async function writeSmokeReportFile(filePath, input) {
  const report = buildSmokeReport(input);
  await fs.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}
