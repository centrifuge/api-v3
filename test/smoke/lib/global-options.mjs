/** @param {import('commander').Command} program */
export function attachGlobalOptions(program) {
  return program
    .option("--graphql <url>", "GraphQL endpoint (default: GRAPHQL_URL or production)")
    .option("--sample <n>", "Max rows per smoke (0 = unlimited)", "100")
    .option("--sample-seed <n>", "Seed for diverse sampling")
    .option("--only <ids>", "Comma-separated smoke ids")
    .option("--mismatches-only", "Print only mismatches", false)
    .option("--concurrency <n>", "Parallel workers", "5")
    .option("--rpc-batch <n>", "eth_call batch size", "20")
    .option("--page-size <n>", "GraphQL page size", "100")
    .option("--tolerance <wei>", "Amount tolerance in wei", "1")
    .option("--chain <name>", "Filter by blockchain name")
    .option("--centrifuge-id <id>", "Filter by centrifugeId")
    .option("--pool-id <id>", "Filter by poolId")
    .option("--token-id <hex>", "Filter by share class id")
    .option("--at-block <n>", "Pin all eth_calls to block")
    .option("--skip-crosschain", "Skip crosschainInProgress rows", true)
    .option("--no-skip-crosschain", "Do not skip crosschainInProgress rows")
    .option("--report-file <path>", "Write JSON smoke report for CI");
}

/**
 * @param {import('commander').Command} cmd
 */
export function parseGlobalOpts(cmd) {
  const o = cmd.opts();
  return {
    graphqlUrl: o.graphql ?? process.env.GRAPHQL_URL?.trim(),
    sample: Number(o.sample),
    sampleSeed: o.sampleSeed != null ? Number(o.sampleSeed) : undefined,
    only: o.only ? o.only.split(",").map((s) => s.trim()).filter(Boolean) : null,
    mismatchesOnly: Boolean(o.mismatchesOnly),
    concurrency: Number(o.concurrency),
    rpcBatch: Number(o.rpcBatch),
    pageSize: Number(o.pageSize),
    tolerance: BigInt(o.tolerance ?? "1"),
    atBlock: o.atBlock != null ? BigInt(o.atBlock) : undefined,
    skipCrosschain: o.skipCrosschain !== false,
    filters: {
      chain: o.chain,
      centrifugeId: o.centrifugeId,
      poolId: o.poolId,
      tokenId: o.tokenId,
    },
    reportFile: o.reportFile,
  };
}
