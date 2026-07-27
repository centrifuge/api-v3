import path from "node:path";
import { specsRoot } from "./lib/env.mjs";

/** @typedef {import('./lib/context.mjs').SmokeContext} SmokeContext */

/**
 * @typedef {object} SmokeDef
 * @property {string} description
 * @property {string} mode
 * @property {string} specPath
 * @property {() => Promise<{ runSmoke: (ctx: SmokeContext) => Promise<SmokeResult> }>} load
 * @property {(cmd: import('commander').Command) => void} [registerOptions]
 */

/**
 * @typedef {object} SmokeResult
 * @property {number} checked
 * @property {number} skipped
 * @property {import('./lib/report.mjs').Mismatch[]} mismatches
 */

/** @type {Record<string, SmokeDef>} */
export const SMOKES = {
  issuance: {
    description: "TokenInstance.totalIssuance vs ERC20.totalSupply()",
    mode: "correctness",
    specPath: path.join(specsRoot, "issuance.md"),
    load: () => import("./checks/issuance.mjs"),
    registerOptions: (cmd) => {
      cmd
        .option("--symbol <symbol>", "Share token symbol")
        .option("--all-instances", "All active token instances")
        .option("--since-creation", "Walk all period snapshots")
        .option("--snapshots <n>", "Max recent snapshots per instance", "5")
        .option("--with-live", "With --all-instances: also check live row")
        .option("--latest-snapshot-only", "Skip live check");
    },
  },
  onramp: {
    description: "Full onramp(asset) probe vs OnRampAsset rows",
    mode: "completeness",
    specPath: path.join(specsRoot, "onramp.md"),
    load: () => import("./checks/onramp.mjs"),
    registerOptions: (cmd) => {
      cmd.option("--all-managers", "All indexed managers (default)", true);
      cmd.option("--manager <address>", "Single manager address");
    },
  },
  deployment: {
    description: "Deployment.centrifugeId vs Gateway.localCentrifugeId()",
    mode: "correctness",
    specPath: path.join(specsRoot, "deployment.md"),
    load: () => import("./checks/deployment.mjs"),
  },
  pool: {
    description: "Hub Pool.currency/decimals vs HubRegistry",
    mode: "correctness",
    specPath: path.join(specsRoot, "pool.md"),
    load: () => import("./checks/pool.mjs"),
  },
  "token-count": {
    description: "ShareClassManager.shareClassCount vs tokens.totalCount",
    mode: "completeness",
    specPath: path.join(specsRoot, "token-count.md"),
    load: () => import("./checks/token-count.mjs"),
  },
  "pool-spoke-presence": {
    description: "PoolSpokeBlockchain vs Spoke.isPoolActive",
    mode: "completeness",
    specPath: path.join(specsRoot, "pool-spoke-presence.md"),
    load: () => import("./checks/pool-spoke-presence.mjs"),
  },
  asset: {
    description: "Asset registration decimals and spoke id mapping",
    mode: "correctness",
    specPath: path.join(specsRoot, "asset.md"),
    load: () => import("./checks/asset.mjs"),
  },
  "token-instance": {
    description: "TokenInstance.address vs Spoke.shareToken",
    mode: "correctness",
    specPath: path.join(specsRoot, "token-instance.md"),
    load: () => import("./checks/token-instance.mjs"),
  },
  escrow: {
    description: "Escrow.address vs BalanceSheet.escrow",
    mode: "correctness",
    specPath: path.join(specsRoot, "escrow.md"),
    load: () => import("./checks/escrow.mjs"),
  },
  vault: {
    description: "Vault linkage vs VaultRegistry.vaultDetails",
    mode: "correctness",
    specPath: path.join(specsRoot, "vault.md"),
    load: () => import("./checks/vault.mjs"),
  },
  snapshots: {
    description: "Historical snapshots vs pinned eth_call at blockNumber",
    mode: "historical",
    specPath: path.join(specsRoot, "snapshots.md"),
    load: () => import("./checks/snapshots.mjs"),
    registerOptions: (cmd) => {
      cmd
        .option("--snapshots-per-type <n>", "Max snapshots per entity type", "5")
        .option("--snapshot-triggers <csv>", "Filter triggers")
        .option("--types <csv>", "instance,token,pool", "instance,token,pool")
        .option("--since-block <n>", "Min blockNumber");
    },
  },
};

export const SMOKE_IDS = Object.keys(SMOKES);
