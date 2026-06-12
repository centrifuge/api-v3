import { Service } from "./Service";
import { ShareIssuance } from "ponder:schema";
import type { Context, Event } from "ponder:registry";
import { serviceLog, expandInlineObject } from "../helpers/logger";

/**
 * Service class for recording direct share issuances/revocations.
 *
 * These are `BalanceSheet.issue()` / `BalanceSheet.revoke()` calls — the mint/burn
 * primitive underlying every share supply change. The deposit flow (async/sync
 * request managers) routes through the same primitive, so callers should set
 * `isManual` to distinguish operator-driven mints from flow-driven ones.
 */
export class ShareIssuanceService extends Service<typeof ShareIssuance> {
  static readonly entityTable = ShareIssuance;
  static readonly entityName = "ShareIssuance";

  /**
   * Records a share mint (`BalanceSheet.Issue`).
   *
   * @param context - The Ponder context for database operations
   * @param data - The issuance data excluding the type field
   * @param event - The event containing the block information
   * @returns Promise resolving to the created share issuance record
   */
  static async recordIssue(context: Context, data: ShareIssuanceData, event: Event) {
    serviceLog("Creating share issuance of type ISSUE with data:", expandInlineObject(data));
    return this.insert(context, { ...data, type: "ISSUE" }, event);
  }

  /**
   * Records a share burn (`BalanceSheet.Revoke`).
   *
   * @param context - The Ponder context for database operations
   * @param data - The issuance data excluding the type field
   * @param event - The event containing the block information
   * @returns Promise resolving to the created share issuance record
   */
  static async recordRevoke(context: Context, data: ShareIssuanceData, event: Event) {
    serviceLog("Creating share issuance of type REVOKE with data:", expandInlineObject(data));
    return this.insert(context, { ...data, type: "REVOKE" }, event);
  }
}

type ShareIssuanceData = Omit<
  typeof ShareIssuance.$inferInsert,
  "type" | "createdAt" | "createdAtBlock" | "updatedAt" | "updatedAtBlock"
>;
