import { BasinSwap } from "ponder:schema";
import { Service } from "./Service";

/**
 * Service for `basin_swap` rows (GroveBasin instant swaps, i.e. CFGL OTC trades).
 * Swaps are decoupled from redemptions under the CFGL model; the debt ledger
 * (`BasinDebtService`) is the connective tissue between the two.
 *
 * @extends {Service<typeof BasinSwap>}
 */
export class BasinSwapService extends Service<typeof BasinSwap> {
  static readonly entityTable = BasinSwap;
  static readonly entityName = "BasinSwap";
}
