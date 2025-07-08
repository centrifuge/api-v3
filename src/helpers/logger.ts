import type { Event } from "ponder:registry";

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
export function logEvent(event: Event, name?: string) {
  // @ts-expect-error - args is not typed in the Event type
  const { block, args } = event;
  const date = new Date(Number(block.timestamp) * 1000);
  const eventDetails = args ? Object.entries(args).reduce<string[]>((details: string[], line: [string, any]) => {
    details.push(line.join(': '));
    return details;
  }, []) : ['undefined'];
  console.info(
    `Received event ${name} on block ${block.number}, timestamp ${date.toISOString()}, args: ${eventDetails.join(', ')}`
  );
}
