import { Policy, PolicyCrosschainInProgressTypes } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { Service } from "./Service";

/**
 * Service for managing policies.
 *
 */
export class PolicyService extends Service<typeof Policy> {
  static readonly entityTable = Policy;
  static readonly entityName = "Policy";
  /**
   * Sets the Merkle policy root (finalized on-spoke value).
   */
  public setRoot(root: `0x${string}`) {
    this.data.root = root;
    serviceLog(`Setting policy root`);
    return this;
  }

  /**
   * @param crosschainInProgress - Set to track Hub-initiated update; omit to clear
   */
  public setCrosschainInProgress(
    crosschainInProgress?: (typeof PolicyCrosschainInProgressTypes)[number]
  ) {
    this.data.crosschainInProgress = crosschainInProgress ?? null;
    serviceLog(`Setting crosschainInProgress to ${crosschainInProgress}`);
    return this;
  }
}
