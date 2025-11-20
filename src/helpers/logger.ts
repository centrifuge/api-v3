import type { Event, Context } from "ponder:registry";
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
    ? Object.entries(args).reduce<string[]>(
        (details: string[], line: [string, any]) => {
          details.push(line.join(": "));
          return details;
        },
        []
      )
    : ["{}"];
  process.stdout.write(
    `Received event ${name} on block ${block.number} with chainId ${chain.id}, timestamp ${date.toISOString()}, args: ${eventDetails.join(", ")}, txHash: ${transaction?.hash || "unknown"}\n`
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
  return "{" + Object.entries(obj).map(([key, value]) => {
    if (typeof value === "object") {
      return `${key}: ${expandInlineObject(value)}`;
    }
    return `${key}: ${value}`;
  }).join(", ") + "}";
}

/**
 * Logs a message to the console with a prefix.
 *
 * @param args - The arguments to log
 */
export function serviceLog(...args: any[]) {
  process.stdout.write("> " + args.join(" ") + "\n");
}
