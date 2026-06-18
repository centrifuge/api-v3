import type { Context, Event } from "ponder:registry";
import { BasinRedeemRequest } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { timestamper } from "../helpers/timestamper";
import { Service, type DataWithoutDefaults } from "./Service";
import { basinRedeemRequestStateCase } from "../helpers/crosschainInProgressCase";

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
   * Upserts basin redeem facts and derived state enum.
   * @param context - Ponder context
   * @param event - Source event
   * @param key - Basin redeem PK
   * @param facts - Fact fields to merge
   * @returns Service instance
   */
  static async upsertFacts(
    context: Context,
    event: TxEvent,
    key: { basinAddress: `0x${string}`; requestId: `0x${string}` },
    facts: Partial<DataWithoutDefaults<typeof BasinRedeemRequest>>
  ): Promise<BasinRedeemRequestService> {
    const ts = new Date(Number(event.block.timestamp) * 1000);
    const row = {
      centrifugeId: facts.centrifugeId ?? "0",
      poolId: facts.poolId ?? 0n,
      tokenId: facts.tokenId ?? (`0x${"00".repeat(32)}` as `0x${string}`),
      assetId: facts.assetId ?? 0n,
      redeemer: facts.redeemer ?? (`0x${"00".repeat(20)}` as `0x${string}`),
      creditTokenAmount: facts.creditTokenAmount ?? 0n,
      collateralTokenAmountQuoted: facts.collateralTokenAmountQuoted ?? 0n,
      state: facts.state ?? "INITIATED",
      initiatedAt: facts.initiatedAt ?? ts,
      initiatedAtBlock: facts.initiatedAtBlock ?? Number(event.block.number),
      initiatedAtTxHash: facts.initiatedAtTxHash ?? event.transaction.hash,
      ...facts,
      ...key,
      createdAt: ts,
      createdAtBlock: Number(event.block.number),
      createdAtTxHash: event.transaction.hash,
      updatedAt: ts,
      updatedAtBlock: Number(event.block.number),
      updatedAtTxHash: event.transaction.hash,
    };

    const [entity] = await context.db.sql
      .insert(BasinRedeemRequest)
      .values(row)
      .onConflictDoUpdate({
        target: [BasinRedeemRequest.basinAddress, BasinRedeemRequest.requestId],
        set: { state: basinRedeemRequestStateCase() } as unknown as Partial<typeof row>,
      })
      .returning();

    if (!entity) throw new Error("BasinRedeemRequest upsertFacts failed");
    return new BasinRedeemRequestService(BasinRedeemRequest, "BasinRedeemRequest", context, entity);
  }

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
