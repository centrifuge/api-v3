import type { Context, Event } from "ponder:registry";
import { SmartContractWard } from "ponder:schema";
import { expandInlineObject, serviceError, serviceLog } from "../helpers/logger";
import { Service } from "./Service";

type SmartContractWardKey = {
  fromChainId: number;
  fromAddress: `0x${string}`;
  toChainId: number;
  toAddress: `0x${string}`;
};

/**
 * Service class for ward relationships between auth-enabled contracts and ward addresses.
 */
export class SmartContractWardService extends Service<typeof SmartContractWard> {
  static readonly entityTable = SmartContractWard;
  static readonly entityName = "SmartContractWard";

  /**
   * Upserts the latest active state for a ward relationship.
   */
  static async setActive(
    context: Context,
    input: SmartContractWardKey,
    isActive: boolean,
    event: Event
  ): Promise<SmartContractWardService | null> {
    const normalized = {
      fromChainId: input.fromChainId,
      fromAddress: input.fromAddress.toLowerCase() as `0x${string}`,
      toChainId: input.toChainId,
      toAddress: input.toAddress.toLowerCase() as `0x${string}`,
      isActive,
    };
    serviceLog("SmartContractWard setActive", expandInlineObject(normalized));
    const ward = await this.upsert(context, normalized, event);
    if (!ward) {
      serviceError("Failed to upsert SmartContractWard", expandInlineObject(normalized));
    }
    return ward;
  }
}
