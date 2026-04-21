import type { Context, Event } from "ponder:registry";
import { InvestorPositionCheckpoint } from "ponder:schema";
import { expandInlineObject, serviceLog } from "../helpers/logger";
import { Service } from "./Service";

/**
 * Service class for immutable investor position checkpoint rows.
 */
export class InvestorPositionCheckpointService extends Service<typeof InvestorPositionCheckpoint> {
  static readonly entityTable = InvestorPositionCheckpoint;
  static readonly entityName = "InvestorPositionCheckpoint";

  /**
   * Inserts a single investor position checkpoint for a transfer-side balance change.
   */
  static async createCheckpoint(
    context: Context,
    data: InvestorPositionCheckpointData,
    event: Event
  ) {
    serviceLog("Creating investor position checkpoint", expandInlineObject(data));
    return this.insert(context, data, event);
  }
}

type InvestorPositionCheckpointData = Omit<
  typeof InvestorPositionCheckpoint.$inferInsert,
  "createdAt" | "createdAtBlock" | "createdAtTxHash"
>;
