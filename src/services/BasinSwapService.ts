import { BasinSwap } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { Service } from "./Service";

/**
 * Service for `basin_swap` rows (GroveBasin instant swaps).
 *
 * @extends {Service<typeof BasinSwap>}
 */
export class BasinSwapService extends Service<typeof BasinSwap> {
  static readonly entityTable = BasinSwap;
  static readonly entityName = "BasinSwap";

  /**
   * Assigns this swap to a basin redeem batch (`RedeemInitiated` sweep).
   *
   * @param requestId - `basin_redeem_request.requestId`
   */
  linkToRedeemRequest(requestId: `0x${string}`): void {
    serviceLog(
      `BasinSwap linkToRedeemRequest tx=${this.data.txHash} logIndex=${this.data.logIndex} requestId=${requestId}`
    );
    this.data.basinRedeemRequestId = requestId;
  }

  /**
   * Stores NAV priority-fee delta after batch `RedeemCompleted`.
   *
   * @param bps - Basis points, or `null` if not computable
   */
  setPriorityFeeDeltaBps(bps: number | null): void {
    serviceLog(
      `BasinSwap setPriorityFeeDeltaBps tx=${this.data.txHash} logIndex=${this.data.logIndex} bps=${bps}`
    );
    this.data.priorityFeeDeltaBps = bps;
  }
}
