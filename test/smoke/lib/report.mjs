/** Marker for create-or-update PR comments. */
export const SMOKE_PR_COMMENT_MARKER = "<!-- cfg-api-v3-smoke-report -->";

/**
 * @typedef {object} Mismatch
 * @property {string} smokeId
 * @property {string} entityId
 * @property {string} field
 * @property {string} indexed
 * @property {string} onchain
 * @property {string} [note]
 */

/**
 * @typedef {object} SmokeRunResult
 * @property {string} smokeId
 * @property {number} checked
 * @property {number} skipped
 * @property {Mismatch[]} mismatches
 */

/**
 * @typedef {object} SmokeReport
 * @property {string} region
 * @property {string} graphqlUrl
 * @property {"pass" | "mismatch" | "error"} status
 * @property {string} [error]
 * @property {string} ranAt
 * @property {SmokeRunResult[]} smokes
 * @property {number} totalChecked
 * @property {number} totalSkipped
 * @property {number} totalMismatches
 */

/**
 * @param {string} smokeId
 * @param {Mismatch[]} mismatches
 * @param {{ checked: number; skipped: number; mismatchesOnly?: boolean; extra?: string }} summary
 */
export function printSmokeSummary(smokeId, mismatches, summary) {
  const { checked, skipped, mismatchesOnly, extra } = summary;
  const line = `[smoke:${smokeId}] checked=${checked} skipped=${skipped} mismatches=${mismatches.length}${extra ? ` ${extra}` : ""}`;
  if (mismatches.length === 0 && mismatchesOnly) return;
  console.log(line);
  if (!mismatchesOnly || mismatches.length > 0) {
    for (const m of mismatches) {
      console.log(
        `  ${m.entityId} ${m.field}: indexed=${m.indexed} onchain=${m.onchain}${m.note ? ` (${m.note})` : ""}`
      );
    }
  }
}

/**
 * @param {Array<{ smokeId: string; checked: number; skipped: number; mismatches: Mismatch[] }>} results
 */
export function printFinalSummary(results) {
  const totalMismatches = results.reduce((n, r) => n + r.mismatches.length, 0);
  console.log("");
  console.log(
    `Total: ${results.length} smoke(s), ${results.reduce((n, r) => n + r.checked, 0)} checked, ${totalMismatches} mismatch(es)`
  );
  return totalMismatches;
}

/**
 * @param {SmokeRunResult[]} results
 */
export function summarizeSmokeResults(results) {
  return {
    totalChecked: results.reduce((n, r) => n + r.checked, 0),
    totalSkipped: results.reduce((n, r) => n + r.skipped, 0),
    totalMismatches: results.reduce((n, r) => n + r.mismatches.length, 0),
  };
}

/**
 * @param {object} input
 * @param {string} input.region
 * @param {string} input.graphqlUrl
 * @param {SmokeRunResult[]} [input.results]
 * @param {string} [input.error]
 * @returns {SmokeReport}
 */
export function buildSmokeReport({ region, graphqlUrl, results = [], error }) {
  const totals = summarizeSmokeResults(results);
  /** @type {SmokeReport["status"]} */
  let status = "pass";
  if (error) status = "error";
  else if (totals.totalMismatches > 0) status = "mismatch";

  return {
    region,
    graphqlUrl,
    status,
    error,
    ranAt: new Date().toISOString(),
    smokes: results,
    ...totals,
  };
}

/**
 * @param {SmokeReport[]} reports
 * @param {{ workflowUrl?: string; commitSha?: string }} [meta]
 * @returns {string}
 */
export function formatSmokePrComment(reports, meta = {}) {
  const sorted = [...reports].sort((a, b) => a.region.localeCompare(b.region));
  const overallPass = sorted.every((r) => r.status === "pass");
  const lines = [SMOKE_PR_COMMENT_MARKER, "## Smoke test results", ""];

  if (meta.workflowUrl) {
    lines.push(`[Workflow run](${meta.workflowUrl})`, "");
  }

  lines.push(
    "| Region | GraphQL | Status | Checked | Skipped | Mismatches |",
    "| --- | --- | --- | ---: | ---: | ---: |"
  );

  for (const report of sorted) {
    const statusLabel =
      report.status === "pass"
        ? "✅ pass"
        : report.status === "mismatch"
          ? "❌ mismatch"
          : "⚠️ error";
    lines.push(
      `| ${report.region} | \`${report.graphqlUrl}\` | ${statusLabel} | ${report.totalChecked} | ${report.totalSkipped} | ${report.totalMismatches} |`
    );
  }

  lines.push("");

  for (const report of sorted) {
    if (report.error) {
      lines.push(`### ${report.region} — error`, "", "```", report.error, "```", "");
      continue;
    }

    const withMismatches = report.smokes.filter((s) => s.mismatches.length > 0);
    if (withMismatches.length === 0) continue;

    lines.push(`### ${report.region} — mismatches`, "");
    for (const smoke of withMismatches) {
      lines.push(`#### \`${smoke.smokeId}\` (${smoke.mismatches.length})`, "");
      for (const m of smoke.mismatches) {
        const note = m.note ? ` — ${m.note}` : "";
        lines.push(
          `- **${m.entityId}** \`${m.field}\`: indexed=\`${m.indexed}\` onchain=\`${m.onchain}\`${note}`
        );
      }
      lines.push("");
    }
  }

  if (overallPass) {
    lines.push("All staging regions passed.");
  } else {
    lines.push("**Release blocked** until mismatches are resolved or explained.");
  }

  if (meta.commitSha) {
    lines.push("", `Commit: \`${meta.commitSha.slice(0, 7)}\``);
  }

  return lines.join("\n");
}
