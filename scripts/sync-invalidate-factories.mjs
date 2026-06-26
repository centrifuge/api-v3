#!/usr/bin/env node
/* eslint-disable jsdoc/require-jsdoc */
/**
 * Invalidate Ponder factory discovery cache (ponder_sync) without wiping RPC cache.
 *
 * @see AGENTS.md § Ponder factory discovery cache bug
 */
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

/** Ponder factory-child log_* fragment id pattern (parent_selector_location). */
const FACTORY_CHILD_LOG_FRAGMENT_RE =
  "^log_[0-9]+_0x[0-9a-f]+_0x[0-9a-f]+_(topic[123]|offset[0-9]+)_";

/**
 * @typedef {{ dryRun: boolean; yes: boolean; chainId: number | null }} CliOptions
 */

/**
 * @param {string[]} argv
 * @returns {CliOptions}
 */
function parseArgs(argv) {
  /** @type {CliOptions} */
  const options = { dryRun: false, yes: false, chainId: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--yes" || arg === "-y") {
      options.yes = true;
      continue;
    }
    if (arg === "--chain-id" || arg === "--chain") {
      const raw = argv[i + 1];
      if (!raw) throw new Error(`${arg} requires a chain id (e.g. 1, 43114)`);
      const chainId = Number(raw);
      if (!Number.isInteger(chainId) || chainId <= 0) {
        throw new Error(`Invalid chain id: ${raw}`);
      }
      options.chainId = chainId;
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.dryRun && options.yes) {
    throw new Error("Use either --dry-run or --yes, not both");
  }

  return options;
}

function printHelp() {
  console.log(`Usage: pnpm sync:invalidate-factories [options]

Clear ponder_sync factory discovery state for all factory mappings (vault, pool
escrow, on/off-ramp manager, merkle manager, token instance, refund escrow) while
keeping blocks/logs/transactions RPC cache intact.

Stop Ponder before running. Optional backup: pnpm sync:export

Options:
  --dry-run           Show counts only; do not modify the database
  --yes, -y           Apply invalidation (required unless --dry-run)
  --chain-id <id>     Limit to one chain (e.g. 1 = ethereum, 43114 = avalanche)
  -h, --help          Show this help

Examples:
  pnpm sync:invalidate-factories --dry-run
  pnpm sync:invalidate-factories --yes
  pnpm sync:invalidate-factories --chain-id 43114 --yes
`);
}

/**
 * @param {import("pg").Client} client
 */
async function assertPonderSyncSchema(client) {
  const { rows } = await client.query(`
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'ponder_sync'
    LIMIT 1
  `);
  if (rows.length === 0) {
    throw new Error(
      "ponder_sync schema not found — start Postgres and run pnpm sync or pnpm dev first"
    );
  }
}

/**
 * @param {import("pg").Client} client
 * @param {number | null} chainId
 */
async function preflight(client, chainId) {
  const params = chainId === null ? [] : [chainId];
  const chainFilter = chainId === null ? "" : "AND chain_id = $1";
  const intervalChainFilter = chainId === null ? "" : "AND i.chain_id = $1";
  const regexParam = `$${params.length + 1}`;

  const factoryAddresses = await client.query(
    `SELECT COUNT(*)::bigint AS count FROM ponder_sync.factory_addresses WHERE TRUE ${chainFilter}`,
    params
  );

  const intervals = await client.query(
    `
    SELECT COUNT(*)::bigint AS count
    FROM ponder_sync.intervals i
    WHERE (
      i.fragment_id LIKE 'factory_log_%'
      OR i.fragment_id ~* ${regexParam}
    )
    ${intervalChainFilter}
    `,
    [...params, FACTORY_CHILD_LOG_FRAGMENT_RE]
  );

  return {
    factoryAddresses: Number(factoryAddresses.rows[0]?.count ?? 0),
    factoryIntervals: Number(intervals.rows[0]?.count ?? 0),
  };
}

/**
 * @param {import("pg").Client} client
 * @param {number | null} chainId
 * @param {{ factoryAddresses: number; factoryIntervals: number }} expected
 */
async function invalidate(client, chainId, expected) {
  const chainParams = chainId === null ? [] : [chainId];
  const chainClause = chainId === null ? "TRUE" : "i.chain_id = $1";

  await client.query("BEGIN");
  try {
    await client.query(
      `
      CREATE TEMP TABLE _factory_child_intervals ON COMMIT DROP AS
      SELECT i.fragment_id, i.chain_id
      FROM ponder_sync.intervals i
      WHERE (${chainClause})
        AND (
          i.fragment_id LIKE 'factory_log_%'
          OR i.fragment_id ~* $${chainParams.length + 1}
        )
      `,
      [...chainParams, FACTORY_CHILD_LOG_FRAGMENT_RE]
    );

    if (chainId === null) {
      await client.query("DELETE FROM ponder_sync.factory_addresses");
    } else {
      await client.query("DELETE FROM ponder_sync.factory_addresses WHERE chain_id = $1", [
        chainId,
      ]);
    }

    await client.query(`
      DELETE FROM ponder_sync.intervals i
      USING _factory_child_intervals t
      WHERE i.fragment_id = t.fragment_id
        AND t.fragment_id LIKE 'factory_log_%'
    `);

    await client.query(
      `
      DELETE FROM ponder_sync.intervals i
      USING _factory_child_intervals t
      WHERE i.fragment_id = t.fragment_id
        AND t.fragment_id ~* $1
      `,
      [FACTORY_CHILD_LOG_FRAGMENT_RE]
    );

    await client.query(`
      DELETE FROM ponder_sync.intervals
      WHERE blocks = '{}'::nummultirange
    `);

    const after = await preflight(client, chainId);

    await client.query("COMMIT");

    return {
      factoryAddressesRemoved: expected.factoryAddresses,
      factoryIntervalsRemoved: expected.factoryIntervals,
      factoryAddressesRemaining: after.factoryAddresses,
      factoryIntervalsRemaining: after.factoryIntervals,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/**
 * @param {CliOptions} options
 */
function formatScope(options) {
  return options.chainId === null ? "all chains" : `chain_id=${options.chainId}`;
}

/**
 * @param {CliOptions} options
 */
async function main(options) {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required (set in .env or .env.local)");
  }

  const client = new Client({ connectionString });
  client.on("notice", (msg) => {
    if (msg.message) console.log(msg.message);
  });

  await client.connect();
  try {
    await assertPonderSyncSchema(client);

    const scope = formatScope(options);
    const counts = await preflight(client, options.chainId);

    console.log(`[sync:invalidate-factories] scope: ${scope}`);
    console.log(`  factory_addresses to clear: ${counts.factoryAddresses}`);
    console.log(`  factory-related intervals to clear: ${counts.factoryIntervals}`);

    if (counts.factoryAddresses === 0 && counts.factoryIntervals === 0) {
      console.log("Nothing to invalidate — factory sync state already empty.");
      return;
    }

    if (options.dryRun) {
      console.log("Dry run only — no changes made. Re-run with --yes to apply.");
      return;
    }

    if (!options.yes) {
      console.error(
        "Refusing to modify ponder_sync without --yes. Re-run with: pnpm sync:invalidate-factories --yes"
      );
      process.exit(1);
    }

    console.log("Applying factory cache invalidation…");
    const result = await invalidate(client, options.chainId, counts);

    console.log("Done.");
    console.log(`  removed factory_addresses: ${result.factoryAddressesRemoved}`);
    console.log(`  removed factory-related intervals: ${result.factoryIntervalsRemoved}`);
    console.log(`  remaining factory_addresses (${scope}): ${result.factoryAddressesRemaining}`);
    console.log(`  remaining factory-related intervals (${scope}): ${result.factoryIntervalsRemaining}`);
    console.log("");
    console.log("Restart Ponder to rescan factories. Note: _ponder_checkpoint is unchanged;");
    console.log("handlers may not replay historical factory-child events until checkpoints rewind.");
  } finally {
    await client.end();
  }
}

const options = parseArgs(process.argv.slice(2));
main(options).catch((error) => {
  console.error("sync:invalidate-factories failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
