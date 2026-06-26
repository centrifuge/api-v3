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

const HEX_ADDRESS_RE = /^0x[0-9a-f]{40}$/;

/**
 * @typedef {{
 *   dryRun: boolean;
 *   yes: boolean;
 *   chainId: number | null;
 *   factoryAddresses: string[];
 * }} CliOptions
 */

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeHexAddress(raw) {
  const address = raw.trim().toLowerCase();
  if (!HEX_ADDRESS_RE.test(address)) {
    throw new Error(`Invalid factory address: ${raw} (expected 0x + 40 hex chars)`);
  }
  return address;
}

/**
 * Regex patterns for factory_log_* and factory-child log_* fragments for one parent.
 *
 * @see ponder packages/core/src/runtime/fragments.ts encodeFragment
 * @param {number} chainId
 * @param {string} factoryAddress lowercase 0x address
 * @returns {string[]}
 */
function factoryIntervalPatterns(chainId, factoryAddress) {
  return [
    `^factory_log_${chainId}_${factoryAddress}_`,
    `^log_${chainId}_${factoryAddress}_0x[0-9a-f]+_(topic[123]|offset[0-9]+)_`,
  ];
}

/**
 * @param {CliOptions} options
 * @returns {string[]}
 */
function allIntervalPatterns(options) {
  if (options.factoryAddresses.length === 0) {
    return [FACTORY_CHILD_LOG_FRAGMENT_RE];
  }
  if (options.chainId === null) {
    throw new Error("internal: factory scope without chainId");
  }
  return options.factoryAddresses.flatMap((address) =>
    factoryIntervalPatterns(options.chainId, address)
  );
}

/**
 * @param {string[]} argv
 * @returns {CliOptions}
 */
function parseArgs(argv) {
  /** @type {CliOptions} */
  const options = { dryRun: false, yes: false, chainId: null, factoryAddresses: [] };

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
    if (arg === "--factory" || arg === "--factory-address") {
      const raw = argv[i + 1];
      if (!raw) throw new Error(`${arg} requires a contract address`);
      options.factoryAddresses.push(normalizeHexAddress(raw));
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

  if (options.factoryAddresses.length > 0 && options.chainId === null) {
    throw new Error("--factory requires --chain-id");
  }

  options.factoryAddresses = [...new Set(options.factoryAddresses)];

  return options;
}

function printHelp() {
  console.log(`Usage: pnpm sync:invalidate-factories [options]

Clear ponder_sync factory discovery state while keeping blocks/logs/transactions
RPC cache intact. By default all factory mappings are cleared (vault, pool escrow,
on/off-ramp manager, merkle manager, token instance, refund escrow).

Stop Ponder before running. Optional backup: pnpm sync:export

Options:
  --dry-run              Show counts (and matched intervals) only; do not modify
  --yes, -y              Apply invalidation (required unless --dry-run)
  --chain-id <id>        Limit to one chain (e.g. 1 = ethereum, 43114 = avalanche)
  --factory <address>    Parent factory contract (repeatable). Requires --chain-id.
                         Clears factory_log_* and factory-child log_* for that parent only.
  -h, --help             Show this help

Examples:
  pnpm sync:invalidate-factories --dry-run
  pnpm sync:invalidate-factories --yes
  pnpm sync:invalidate-factories --chain-id 43114 --yes
  pnpm sync:invalidate-factories --chain-id 43114 --factory 0xabc... --factory 0xdef... --dry-run
  pnpm sync:invalidate-factories --chain-id 43114 --factory 0xabc... --yes
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
 * @param {CliOptions} options
 * @returns {string}
 */
function formatScope(options) {
  const parts = [];
  parts.push(options.chainId === null ? "all chains" : `chain_id=${options.chainId}`);
  if (options.factoryAddresses.length > 0) {
    parts.push(`factories=[${options.factoryAddresses.join(", ")}]`);
  }
  return parts.join(", ");
}

/**
 * @param {import("pg").Client} client
 * @param {CliOptions} options
 */
async function countFactoryAddresses(client, options) {
  if (options.factoryAddresses.length > 0) {
    const { rows } = await client.query(
      `
      SELECT COUNT(*)::bigint AS count
      FROM ponder_sync.factory_addresses fa
      JOIN ponder_sync.factories f ON f.id = fa.factory_id
      WHERE fa.chain_id = $1
        AND lower(f.factory->>'address') = ANY($2::text[])
      `,
      [options.chainId, options.factoryAddresses]
    );
    return Number(rows[0]?.count ?? 0);
  }

  const params = options.chainId === null ? [] : [options.chainId];
  const chainFilter = options.chainId === null ? "" : "AND chain_id = $1";
  const { rows } = await client.query(
    `SELECT COUNT(*)::bigint AS count FROM ponder_sync.factory_addresses WHERE TRUE ${chainFilter}`,
    params
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * @param {import("pg").Client} client
 * @param {CliOptions} options
 */
async function countFactoryIntervals(client, options) {
  const patterns = allIntervalPatterns(options);

  if (options.factoryAddresses.length > 0) {
    const { rows } = await client.query(
      `
      SELECT COUNT(*)::bigint AS count
      FROM ponder_sync.intervals i
      WHERE i.chain_id = $1
        AND i.fragment_id ~* ANY($2::text[])
      `,
      [options.chainId, patterns]
    );
    return Number(rows[0]?.count ?? 0);
  }

  const params = options.chainId === null ? [] : [options.chainId];
  const intervalChainFilter = options.chainId === null ? "" : "AND i.chain_id = $1";
  const regexParam = `$${params.length + 1}`;

  const { rows } = await client.query(
    `
    SELECT COUNT(*)::bigint AS count
    FROM ponder_sync.intervals i
    WHERE (
      i.fragment_id LIKE 'factory_log_%'
      OR i.fragment_id ~* ${regexParam}
    )
    ${intervalChainFilter}
    `,
    [...params, patterns[0]]
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * @param {import("pg").Client} client
 * @param {CliOptions} options
 */
async function listMatchedIntervals(client, options) {
  const patterns = allIntervalPatterns(options);

  if (options.factoryAddresses.length > 0) {
    const { rows } = await client.query(
      `
      SELECT i.fragment_id
      FROM ponder_sync.intervals i
      WHERE i.chain_id = $1
        AND i.fragment_id ~* ANY($2::text[])
      ORDER BY i.fragment_id
      `,
      [options.chainId, patterns]
    );
    return rows.map((row) => row.fragment_id);
  }

  const params = options.chainId === null ? [] : [options.chainId];
  const intervalChainFilter = options.chainId === null ? "" : "AND i.chain_id = $1";

  const { rows } = await client.query(
    `
    SELECT i.fragment_id
    FROM ponder_sync.intervals i
    WHERE (
      i.fragment_id LIKE 'factory_log_%'
      OR i.fragment_id ~* $${params.length + 1}
    )
    ${intervalChainFilter}
    ORDER BY i.fragment_id
    `,
    [...params, patterns[0]]
  );
  return rows.map((row) => row.fragment_id);
}

/**
 * @param {import("pg").Client} client
 * @param {CliOptions} options
 */
async function preflight(client, options) {
  const [factoryAddresses, factoryIntervals] = await Promise.all([
    countFactoryAddresses(client, options),
    countFactoryIntervals(client, options),
  ]);

  return { factoryAddresses, factoryIntervals };
}

/**
 * @param {import("pg").Client} client
 * @param {CliOptions} options
 * @param {{ factoryAddresses: number; factoryIntervals: number }} expected
 */
async function invalidate(client, options, expected) {
  const patterns = allIntervalPatterns(options);

  await client.query("BEGIN");
  try {
    if (options.factoryAddresses.length > 0) {
      await client.query(
        `
        CREATE TEMP TABLE _factory_child_intervals ON COMMIT DROP AS
        SELECT i.fragment_id, i.chain_id
        FROM ponder_sync.intervals i
        WHERE i.chain_id = $1
          AND i.fragment_id ~* ANY($2::text[])
        `,
        [options.chainId, patterns]
      );

      await client.query(
        `
        DELETE FROM ponder_sync.factory_addresses fa
        USING ponder_sync.factories f
        WHERE fa.factory_id = f.id
          AND fa.chain_id = $1
          AND lower(f.factory->>'address') = ANY($2::text[])
        `,
        [options.chainId, options.factoryAddresses]
      );
    } else {
      const chainParams = options.chainId === null ? [] : [options.chainId];
      const chainClause = options.chainId === null ? "TRUE" : "i.chain_id = $1";

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
        [...chainParams, patterns[0]]
      );

      if (options.chainId === null) {
        await client.query("DELETE FROM ponder_sync.factory_addresses");
      } else {
        await client.query("DELETE FROM ponder_sync.factory_addresses WHERE chain_id = $1", [
          options.chainId,
        ]);
      }
    }

    await client.query(`
      DELETE FROM ponder_sync.intervals i
      USING _factory_child_intervals t
      WHERE i.fragment_id = t.fragment_id
    `);

    await client.query(`
      DELETE FROM ponder_sync.intervals
      WHERE blocks = '{}'::nummultirange
    `);

    const after = await preflight(client, options);

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
    const counts = await preflight(client, options);

    console.log(`[sync:invalidate-factories] scope: ${scope}`);
    console.log(`  factory_addresses to clear: ${counts.factoryAddresses}`);
    console.log(`  factory-related intervals to clear: ${counts.factoryIntervals}`);

    if (counts.factoryAddresses === 0 && counts.factoryIntervals === 0) {
      console.log("Nothing to invalidate — factory sync state already empty for this scope.");
      return;
    }

    if (options.dryRun) {
      const fragments = await listMatchedIntervals(client, options);
      const previewLimit = 30;
      console.log(`  matched interval fragments (${fragments.length}):`);
      for (const fragmentId of fragments.slice(0, previewLimit)) {
        console.log(`    ${fragmentId}`);
      }
      if (fragments.length > previewLimit) {
        console.log(`    … and ${fragments.length - previewLimit} more`);
      }
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
    const result = await invalidate(client, options, counts);

    console.log("Done.");
    console.log(`  removed factory_addresses: ${result.factoryAddressesRemoved}`);
    console.log(`  removed factory-related intervals: ${result.factoryIntervalsRemoved}`);
    console.log(`  remaining factory_addresses (${scope}): ${result.factoryAddressesRemaining}`);
    console.log(
      `  remaining factory-related intervals (${scope}): ${result.factoryIntervalsRemaining}`
    );
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
