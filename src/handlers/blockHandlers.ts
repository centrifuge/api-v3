import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";

ponder.on("sepolia:block", async ({ event, context }) => {
  logEvent(event, "sepolia:block");
});
