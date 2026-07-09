import { multiMapper } from "../helpers/multiMapper";
import { logEvent } from "../helpers/logger";
import { formatBytes32ToAddress } from "../helpers/formatter";
import { BASIN_STATIC_BY_CHAIN_ID, loadBasinConfig } from "../config/basin";
import { BasinDebtService, TokenInstanceService, type TransferEvent } from "../services";

/** Basin credit token per chain, pre-normalized: this handler runs for every tracked token
 * transfer, so the basin match must be decided before any config resolution or logging. */
const basinCreditTokenByChainId: Partial<Record<number, `0x${string}`>> = Object.fromEntries(
  Object.values(BASIN_STATIC_BY_CHAIN_ID).map((cfg) => [
    cfg.chainId,
    formatBytes32ToAddress(cfg.creditToken),
  ])
);

multiMapper("tokenInstance:Transfer", async ({ event, context }) => {
  logEvent(event, context, "tokenInstance:Transfer");
  await TokenInstanceService.applyTransfer(context, event as TransferEvent);

  // CFGL debt tracking: basin credit token (JTRSY) transfers maintain the basin's live
  // balance in BasinDebtService. Cheap address gate first — this is the hot path.
  const creditToken = basinCreditTokenByChainId[context.chain!.id];
  if (!creditToken || formatBytes32ToAddress(event.log.address) !== creditToken) return;
  const basinCfg = loadBasinConfig(context);
  if (!basinCfg) return;

  await BasinDebtService.applyCreditTokenTransfer(context, event as TransferEvent, basinCfg);
});
