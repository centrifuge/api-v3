import type { Event } from "ponder:registry";


export function logEvent(event: Event, name?: string) {
  console.info(
    `Received event ${name} on block ${event.block.number} with timestamp ${event.block.timestamp}: `,
    event.args
  );
}
