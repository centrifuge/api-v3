#!/usr/bin/env node
import "./lib/env.mjs";
import { Command } from "commander";
import { buildSmokeContext } from "./lib/context.mjs";
import { attachGlobalOptions, parseGlobalOpts } from "./lib/global-options.mjs";
import { printFinalSummary, printSmokeSummary } from "./lib/report.mjs";
import { SMOKES, SMOKE_IDS } from "./registry.mjs";
import { writeSmokeReportFile } from "./ci/write-report.mjs";

const program = new Command();
program.name("smoke").description("Indexer integrity smokes (GraphQL vs on-chain views)");

attachGlobalOptions(program);

program
  .command("list")
  .description("List registered smokes")
  .action(() => {
    for (const id of SMOKE_IDS) {
      const def = SMOKES[id];
      console.log(`${id.padEnd(22)} [${def.mode}] ${def.description}`);
      console.log(`  spec: ${def.specPath}`);
    }
  });

/**
 * @param {string} smokeId
 * @param {import('commander').Command} cmd
 */
async function runOneSmoke(smokeId, cmd) {
  const def = SMOKES[smokeId];
  if (!def) throw new Error(`Unknown smoke: ${smokeId}`);

  const global = parseGlobalOpts(cmd);
  const smokeOptions = { ...cmd.opts() };

  const ctx = await buildSmokeContext({
    ...global,
    smokeId,
    smokeOptions,
  });

  const mod = await def.load();
  const result = await mod.runSmoke(ctx);

  printSmokeSummary(smokeId, result.mismatches, {
    checked: result.checked,
    skipped: result.skipped,
    mismatchesOnly: ctx.mismatchesOnly,
    extra: `graphql=${ctx.graphqlUrl}`,
  });

  return { result, graphqlUrl: ctx.graphqlUrl };
}

/**
 * @param {string[]} ids
 * @param {import('commander').Command} cmd
 */
async function runSmokes(ids, cmd) {
  const global = parseGlobalOpts(cmd);
  /** @type {string} */
  let graphqlUrl = global.graphqlUrl ?? process.env.GRAPHQL_URL?.trim() ?? "https://api.centrifuge.io/";
  /** @type {Awaited<ReturnType<typeof runOneSmoke>>["result"][]} */
  const results = [];

  for (const id of ids) {
    const { result, graphqlUrl: url } = await runOneSmoke(id, cmd);
    graphqlUrl = url;
    results.push(result);
  }

  const summaryRows = results.map((r, i) => ({
    smokeId: ids[i],
    checked: r.checked,
    skipped: r.skipped,
    mismatches: r.mismatches,
  }));

  const totalMismatches = printFinalSummary(summaryRows);

  if (global.reportFile) {
    await writeSmokeReportFile(global.reportFile, {
      region: process.env.SMOKE_REGION?.trim() || "default",
      graphqlUrl,
      results: summaryRows,
    });
  }

  return totalMismatches;
}

/**
 * @param {import('commander').Command} cmd
 * @param {() => Promise<number>} run
 */
async function mainAction(cmd, run) {
  try {
    const exitCode = await run();
    process.exit(exitCode > 0 ? 1 : 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);

    const global = parseGlobalOpts(cmd);
    if (global.reportFile) {
      await writeSmokeReportFile(global.reportFile, {
        region: process.env.SMOKE_REGION?.trim() || "default",
        graphqlUrl: global.graphqlUrl ?? process.env.GRAPHQL_URL?.trim() ?? "",
        results: [],
        error: message,
      });
    }

    process.exit(2);
  }
}

for (const id of SMOKE_IDS) {
  const def = SMOKES[id];
  const sub = program.command(id).description(def.description);
  attachGlobalOptions(sub);
  if (def.registerOptions) def.registerOptions(sub);
  sub.action(async function action() {
    await mainAction(sub, () => runSmokes([id], sub));
  });
}

program.action(async function defaultAction() {
  const global = parseGlobalOpts(program);
  const ids = global.only ?? SMOKE_IDS;
  const unknown = ids.filter((id) => !SMOKES[id]);
  if (unknown.length) {
    console.error(`Unknown smoke id(s): ${unknown.join(", ")}`);
    process.exit(2);
  }
  await mainAction(program, () => runSmokes(ids, program));
});

program.parseAsync(process.argv);
