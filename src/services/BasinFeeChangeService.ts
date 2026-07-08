import { BasinFeeChange } from "ponder:schema";
import { Service } from "./Service";

/**
 * Service for `basin_fee_change` rows: the immutable ledger of GroveBasin swap fee rate
 * changes (`PurchaseFeeSet` / `RedemptionFeeSet`), one row per rate-setting log. Enables
 * reconstructing the fee rate effective at any historical swap timestamp.
 *
 * @extends {Service<typeof BasinFeeChange>}
 */
export class BasinFeeChangeService extends Service<typeof BasinFeeChange> {
  static readonly entityTable = BasinFeeChange;
  static readonly entityName = "BasinFeeChange";
}
