import type { Event, Context } from "ponder:registry";
const isStart = process.argv.includes("start");

/**
 * Adds thousands separators (') to a number, grouping digits every 3 from the end.
 *
 * @param value - The value to format (bigint, number, or string)
 * @returns The formatted string with thousands separators and the "n" suffix
 *
 * @example
 * ```typescript
 * addThousandsSeparator(1234567) // "1'234'567n
 * addThousandsSeparator("1000") // "1'000"
 * addThousandsSeparator(1234567n) // "1'234'567"
 * ```
 */
export function addThousandsSeparator(value: bigint | number | string): string {
  const valueStr = value.toString();
  return valueStr.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}
/**
 * Logs blockchain event details to the console with formatted output.
 *
 * This function takes a blockchain event and optionally a name, then formats
 * and logs the event details including block number, timestamp, and event arguments.
 *
 * @param event - The blockchain event object containing block and args properties
 * @param name - Optional name identifier for the event (defaults to undefined)
 *
 * @example
 * ```typescript
 * logEvent(someEvent, "Transfer");
 * // Output: Received event Transfer on block 12345, timestamp 2023-01-01T00:00:00.000Z, args: from: 0x123..., to: 0x456..., amount: 100
 * ```
 */
export function logEvent(event: Event, context: Context, name?: string) {
  // @ts-expect-error - args is not typed in the Event type
  const { block, args, transaction } = event;
  const { chain } = context;
  const date = new Date(Number(block.timestamp) * 1000);
  const eventDetails = args
    ? Object.entries(args).reduce<string[]>((details: string[], line: [string, any]) => {
        details.push(line.join(": "));
        return details;
      }, [])
    : ["{}"];
  process.stdout.write(
    `Received event ${name} on block ${block.number} with chainId ${chain?.id}, timestamp ${date.toISOString()}, args: ${eventDetails.join(", ")}, txHash: ${transaction?.hash || "unknown"}\n`
  );
}

/**
 * Logs an inline object to the console with formatted output.
 *
 * This function takes an object and formats it into a string with key-value pairs.
 *
 * @param obj - The object to log
 */
export function expandInlineObject(obj: Record<string, any> | null): string {
  if (!obj) return "null";
  return (
    "{" +
    Object.entries(obj)
      .map(([key, value]) => {
        if (typeof value === "object") {
          return `${key}: ${expandInlineObject(value)}`;
        }
        return `${key}: ${value}`;
      })
      .join(", ") +
    "}"
  );
}

/**
 * Logs a message to the console with a prefix.
 *
 * @param args - The arguments to log
 */
export function serviceLog(...args: any[]) {
  if (isStart) return;
  process.stdout.write("> " + args.join(" ") + "\n");
}

/**
 * Logs an error message to the console with a prefix.
 *
 * @param args - The arguments to log
 */
export function serviceError(...args: any[]) {
  process.stderr.write("> [ERROR] " + args.join(" ") + "\n");
}

/**
 * Logs a warning message to the console with a prefix.
 *
 * @param args - The arguments to log
 */
export function serviceWarn(...args: any[]) {
  process.stderr.write("> [WARN] " + args.join(" ") + "\n");
}

/** Per-chain contract entry from `ponder.config` `contracts`. */
type ContractChainEntry = {
  address?: unknown;
  startBlock?: number;
  endBlock?: number;
};

/** Contract map from `ponder.config` `contracts`. */
type ContractsConfig = Record<
  string,
  {
    chain?: Record<string, ContractChainEntry>;
  }
>;

/** Block handler map from `src/chains` `blocks`. */
type BlocksConfig = Record<
  string,
  {
    startBlock: number;
    endBlock?: number;
    interval: number;
    chain: string;
  }
>;

/**
 * Formats a contract address for indexing-plan logs (static vs factory).
 *
 * @param address - Resolved address or Ponder factory config
 * @returns Short label for stdout
 */
function formatIndexingAddress(address: unknown): string {
  if (typeof address === "string") return address;
  if (address !== null && typeof address === "object") return "(factory)";
  return "(unknown)";
}

/**
 * Formats an optional end block for indexing-plan logs.
 *
 * @param endBlock - Last indexed block, if any
 * @returns Decimal string or em dash when open-ended
 */
function formatIndexingEndBlock(endBlock: number | undefined): string {
  return endBlock === undefined ? "—" : String(endBlock);
}

/**
 * Logs the resolved Ponder indexing plan (contract and block sources) once at config load.
 * Uses stdout directly so output appears under `ponder start` (unlike `serviceLog`).
 *
 * @param contracts - Merged `contracts` from `ponder.config.ts`
 * @param blocks - `blocks` from `src/chains.ts`
 */
export function logIndexingPlan(contracts: ContractsConfig, blocks: BlocksConfig): void {
  const blockLines = Object.entries(blocks)
    .map(([network, cfg]) => ({
      network,
      line: `[index] blockHandler ${network}:block startBlock=${cfg.startBlock} interval=${cfg.interval} endBlock=${formatIndexingEndBlock(cfg.endBlock)}`,
    }))
    .sort((a, b) => a.network.localeCompare(b.network));

  process.stdout.write("[index] === block handlers ===\n");
  for (const { line } of blockLines) {
    process.stdout.write(`${line}\n`);
  }

  const contractLines: { chain: string; contract: string; line: string }[] = [];
  for (const [contractName, contract] of Object.entries(contracts)) {
    const chainConfig = contract.chain;
    if (!chainConfig) continue;
    for (const [network, cfg] of Object.entries(chainConfig)) {
      contractLines.push({
        chain: network,
        contract: contractName,
        line: `[index] contract=${contractName} chain=${network} startBlock=${cfg.startBlock ?? "?"} endBlock=${formatIndexingEndBlock(cfg.endBlock)} address=${formatIndexingAddress(cfg.address)}`,
      });
    }
  }
  contractLines.sort(
    (a, b) => a.chain.localeCompare(b.chain) || a.contract.localeCompare(b.contract)
  );

  process.stdout.write("[index] === contracts ===\n");
  for (const { line } of contractLines) {
    process.stdout.write(`${line}\n`);
  }

  if (blockLines.length === 0 && contractLines.length === 0) {
    process.stdout.write(
      "[index] WARNING: No chains in indexing plan. Check SELECTED_NETWORKS matches generated registry (ENVIRONMENT=testnet pnpm update-registry for Sepolia 11155111).\n"
    );
  }
}
