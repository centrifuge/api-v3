import { XChainPayload, XChainPayloadStatuses } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { Event } from "ponder:registry";

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

  /**
   * Marks the XChainPayload as delivered.
   * 
   * @param {Event} event - The event that marks the XChainPayload as delivered
   * @returns {XChainPayloadService} Returns the current instance for method chaining
   */
  public delivered(event: Event) {
    this.data.status = "Delivered";
    this.data.deliveredAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.deliveredAtBlock = Number(event.block.number);
    return this;
  }

  /**
   * Sets the adapter that sent the XChainPayload.
   * 
   * @param {string} adapter - The adapter that sent the XChainPayload
   * @returns {XChainPayloadService} Returns the current instance for method chaining
   */
  public setAdapterSending(adapter: `0x${string}`) {
    this.data.adapterSending = adapter;
    return this;
  }

  /**
   * Sets the adapter that received the XChainPayload.
   * 
   * @param {string} adapter - The adapter that received the XChainPayload
   * @returns {XChainPayloadService} Returns the current instance for method chaining
   */
  public setAdapterReceiving(adapter: `0x${string}`) {
    this.data.adapterReceiving = adapter;
    return this;
  }
}
