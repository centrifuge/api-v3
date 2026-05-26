import { BasinReconciliationWarning } from "ponder:schema";
import { Service } from "./Service";

/**
 * Service for `basin_reconciliation_warning` (non-fatal ops anomalies).
 *
 * @extends {Service<typeof BasinReconciliationWarning>}
 */
export class BasinReconciliationWarningService extends Service<typeof BasinReconciliationWarning> {
  static readonly entityTable = BasinReconciliationWarning;
  static readonly entityName = "BasinReconciliationWarning";
}
