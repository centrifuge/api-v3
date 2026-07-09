import { ponder } from "ponder:registry";
import { stringToHex } from "viem";
import { loadBasinConfig } from "../config/basin";
import { isSusdsIndexingConfigured } from "../config/sky";
import { logEvent } from "../helpers/logger";
import { BasinDebtService } from "../services";

/** sUSDS `File` key for Sky Savings Rate changes (`bytes32("ssr")`). */
const SSR_FILE_KEY = stringToHex("ssr", { size: 32 });

if (isSusdsIndexingConfigured) {
  ponder.on("susds:File", async ({ event, context }) => {
    const { what, data } = event.args;
    if (what !== SSR_FILE_KEY) return;

    const cfg = loadBasinConfig(context);
    if (!cfg) return;

    logEvent(event, context, "susds:File");

    // Accrue at the old rate up to this block, then switch: the new SSR applies from the
    // exact moment of the governance change. No principal effect.
    const debt = await BasinDebtService.load(context, event, cfg);
    await debt.accrueAndApply(context, event, {
      type: "RATE_UPDATE",
      principalDelta: 0n,
      newSsrPerSecondRay: data,
    });
  });
}
