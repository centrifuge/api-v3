import type { Event } from "ponder:registry";


export function logEvent(event: Event) {
  console.info(
    `Received event ${event.name} on block ${event.block.number} with timestamp ${event.block.timestamp}: `,
    event.args
  );
}
