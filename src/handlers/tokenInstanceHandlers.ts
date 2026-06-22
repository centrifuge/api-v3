import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError } from "../helpers/logger";
import { appendTransferLeg, type TransferEvent } from "../helpers/transferTxBuffer";

multiMapper("tokenInstance:Transfer", async ({ event, context }) => {
  logEvent(event, context, "tokenInstance:Transfer");

  if (!event.transaction?.hash) {
    serviceError("tokenInstance:Transfer missing transaction hash");
    return;
  }

  await appendTransferLeg(context, event as TransferEvent);
});
