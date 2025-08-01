import { XChainPayload, XChainPayloadStatuses } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing XChainPayload entities.
 *
 * This service handles operations related to XChainPayload entities,
 * including creation, updating, and querying.
 *
 * @extends {Service<typeof XChainPayload>}
 */
export class XChainPayloadService extends mixinCommonStatics(
  Service<typeof XChainPayload>,
  XChainPayload,
  "XChainPayload"
) {

  /**
   * Sets the status of the XChainPayload entity.
   * 
   * @param {XChainPayloadStatuses} status - The new status to set for the XChainPayload
   * @returns {XChainPayloadService} Returns the current instance for method chaining
   */
  public setStatus(status: (typeof XChainPayloadStatuses)[number]) {
    this.data.status = status;
    return this;
  }
}
