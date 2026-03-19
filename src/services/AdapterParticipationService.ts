import { Context } from "ponder:registry";
import { Service, mixinCommonStatics } from "./Service";
import { AdapterParticipation } from "ponder:schema";

/**
 * Service for managing on-ramp assets.
 *
 */
export class AdapterParticipationService extends mixinCommonStatics(
  Service<typeof AdapterParticipation>,
  AdapterParticipation,
  "AdapterParticipation"
) {
  /**
   * Counts the number of handled adapter proofs for a given payload ID and payload index
   * @param context - The database and client context
   * @param payloadId - The ID of the payload to count handled adapter proofs for
   * @param payloadIndex - The index of the payload to count handled adapter proofs for
   * @returns The number of handled adapter proofs
   */
  static async countHandledAdapterProofs(
    context: Context,
    payloadId: `0x${string}`,
    payloadIndex: number
  ) {
    return await this.count(context, {
      payloadId,
      payloadIndex,
      type: "PROOF",
      side: "HANDLE",
    });
  }

  /**
   * True when every `SEND` participation (payload and, for **v3 only**, proof rows) has a matching
   * `HANDLE` count for the same `payloadId` + `payloadIndex`. **v3_1** uses payload participations
   * only — the protocol has no adapter proof round.
   */
  static async checkPayloadVerified(
    context: Context,
    payloadId: `0x${string}`,
    payloadIndex: number
  ) {
    const adapterParticipations = (await this.query(context, {
      payloadId,
      payloadIndex,
    })) as AdapterParticipationService[];
    const countSentAdapterParticipations = adapterParticipations.filter(
      (adapterParticipation) => adapterParticipation.read().side === "SEND"
    ).length;
    const countHandledAdapterParticipations = adapterParticipations.filter(
      (adapterParticipation) => adapterParticipation.read().side === "HANDLE"
    ).length;
    return countSentAdapterParticipations === countHandledAdapterParticipations;
  }
}
