import type { Event } from "ponder:registry";
import { BasinRedeemRequest } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { timestamper } from "../helpers/timestamper";
import { Service } from "./Service";

type TxEvent = Extract<Event, { transaction: { hash: `0x${string}` } }>;

/**
 * Service for `basin_redeem_request` (GroveBasin async redeem batches).
 *
 * @extends {Service<typeof BasinRedeemRequest>}
 */
export class BasinRedeemRequestService extends Service<typeof BasinRedeemRequest> {
  static readonly entityTable = BasinRedeemRequest;
  static readonly entityName = "BasinRedeemRequest";

  /**
   * Records spoke `vault:RedeemRequest` timing after TokenRedeemer submits the fund request.
   *
   * @param event - `vault:RedeemRequest` event
   */
  linkSpokeRedeem(event: TxEvent): void {
    serviceLog(`BasinRedeemRequest linkSpokeRedeem requestId=${this.data.requestId}`);
    Object.assign(this.data, timestamper("spokeRedeemRequested", event));
  }

  /**
   * Links this batch to the hub `redeem_order` created on `ApproveRedeems`.
   *
   * @param epochIndex - `redeem_order.index` / epoch id from approval
   */
  linkRedeemOrderIndex(epochIndex: number): void {
    serviceLog(
      `BasinRedeemRequest linkRedeemOrderIndex requestId=${this.data.requestId} epochIndex=${epochIndex}`
    );
    this.data.linkedRedeemOrderIndex = epochIndex;
  }

  /**
   * Marks the batch completed and stores collateral returned from the fund.
   *
   * @param collateralTokenReturned - USDC from `RedeemCompleted`
   * @param event - `RedeemCompleted` event
   */
  complete(collateralTokenReturned: bigint, event: TxEvent): void {
    serviceLog(
      `BasinRedeemRequest complete requestId=${this.data.requestId} collateral=${collateralTokenReturned}`
    );
    this.data.state = "COMPLETED";
    this.data.collateralTokenReturned = collateralTokenReturned;
    Object.assign(this.data, timestamper("completed", event));
  }
}
