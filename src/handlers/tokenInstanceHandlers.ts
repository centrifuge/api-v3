import { multiMapper } from "../helpers/multiMapper";
import { logEvent } from "../helpers/logger";
import { formatBytes32ToAddress } from "../helpers/formatter";
import { loadBasinConfig } from "../config/basin";
import { BasinDebtService, TokenInstanceService, type TransferEvent } from "../services";

multiMapper("tokenInstance:Transfer", async ({ event, context }) => {
  logEvent(event, context, "tokenInstance:Transfer");
  await TokenInstanceService.applyTransfer(context, event as TransferEvent);

  // CFGL debt tracking: maintain the basin's live credit token (JTRSY) balance, the cap
  // for how much a new redemption can be requested for. No debt effect.
  const basinCfg = loadBasinConfig(context);
  if (!basinCfg) return;
  if (formatBytes32ToAddress(event.log.address) !== formatBytes32ToAddress(basinCfg.creditToken)) {
    return;
  }

  const { from, to, value: amount } = event.args;
  const basinAddress = formatBytes32ToAddress(basinCfg.basinAddress);
  const fromNorm = formatBytes32ToAddress(from);
  const toNorm = formatBytes32ToAddress(to);
  if (fromNorm !== toNorm && (fromNorm === basinAddress || toNorm === basinAddress)) {
    const debt = await BasinDebtService.load(context, event, basinCfg);
    debt.adjustCreditTokenBalance(toNorm === basinAddress ? amount : -amount);
    await debt.save(event);
  }
});
