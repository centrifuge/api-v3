import type { Context, Event } from "ponder:registry";
import { SmartContract } from "ponder:schema";
import { expandInlineObject, serviceError, serviceLog } from "../helpers/logger";
import { Service } from "./Service";

type SmartContractKey = {
  chainId: number;
  address: `0x${string}`;
};

/**
 * Service class for chain-scoped smart contracts that participate in the ward graph.
 */
export class SmartContractService extends Service<typeof SmartContract> {
  static readonly entityTable = SmartContract;
  static readonly entityName = "SmartContract";

  /**
   * Ensures the observed contract row exists and refreshes its timestamps.
   */
  static async ensure(
    context: Context,
    input: SmartContractKey,
    event: Event
  ): Promise<SmartContractService | null> {
    const normalized = {
      chainId: input.chainId,
      address: input.address.toLowerCase() as `0x${string}`,
    };
    serviceLog("SmartContract ensure", expandInlineObject(normalized));
    const contract = await this.upsert(context, normalized, event);
    if (!contract) {
      serviceError("Failed to ensure SmartContract", expandInlineObject(normalized));
    }
    return contract;
  }
}
