import { multiMapper } from "../helpers/multiMapper";
import { logEvent } from "../helpers/logger";
import { TokenInstanceService, type TransferEvent } from "../services";

multiMapper("tokenInstance:Transfer", async ({ event, context }) => {
  logEvent(event, context, "tokenInstance:Transfer");
  await TokenInstanceService.applyTransfer(context, event as TransferEvent);
});
