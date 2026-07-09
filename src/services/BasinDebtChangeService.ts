import { BasinDebtChange } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { Service } from "./Service";

/**
 * Service for `basin_debt_change` rows: the immutable ledger of CFGL debt movements
 * (payouts, repayments, rate updates), one row per debt-affecting log.
 *
 * @extends {Service<typeof BasinDebtChange>}
 */
export class BasinDebtChangeService extends Service<typeof BasinDebtChange> {
  static readonly entityTable = BasinDebtChange;
  static readonly entityName = "BasinDebtChange";

  /**
   * Re-labels this change (e.g. a same-tx `TRANSFER_REPAYMENT` claimed by a buy-side swap
   * or a redemption completion). The debt effect stays as recorded; only the type changes.
   *
   * @param type - New change type
   */
  relabel(type: (typeof BasinDebtChange.$inferSelect)["type"]): void {
    serviceLog(
      `BasinDebtChange relabel tx=${this.data.txHash} logIndex=${this.data.logIndex} ` +
        `${this.data.type} -> ${type}`
    );
    this.data.type = type;
  }
}
