import type { Event } from "ponder:registry";


export function logEvent(event: Event, name?: string) {
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
