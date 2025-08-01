import { CrosschainPayload, CrosschainPayloadStatuses } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { Event } from "ponder:registry";

/**
 * Service class for managing CrosschainPayload entities.
 *
 * This service handles operations related to CrosschainPayload entities,
 * including creation, updating, and querying.
 *
 * @extends {Service<typeof CrosschainPayload>}
 */
export class CrosschainPayloadService extends mixinCommonStatics(
  Service<typeof CrosschainPayload>,
  CrosschainPayload,
  "CrosschainPayload"
) {

  /**
   * Sets the status of the CrosschainPayload entity.
   * 
   * @param {CrosschainPayloadStatuses} status - The new status to set for the CrosschainPayload
   * @returns {CrosschainPayloadService} Returns the current instance for method chaining
   */
  public setStatus(status: (typeof CrosschainPayloadStatuses)[number]) {
    this.data.status = status;
    return this;
  }

  /**
   * Marks the CrosschainPayload as delivered.
   * 
   * @param {Event} event - The event that marks the CrosschainPayload as delivered
   * @returns {CrosschainPayloadService} Returns the current instance for method chaining
   */
  public delivered(event: Event) {
    this.data.status = "Delivered";
    this.data.deliveredAt = new Date(Number(event.block.timestamp) * 1000);
    this.data.deliveredAtBlock = Number(event.block.number);
    return this;
  }

  /**
   * Sets the adapter that sent the CrosschainPayload.
   * 
   * @param {string} adapter - The adapter that sent the CrosschainPayload
   * @returns {CrosschainPayloadService} Returns the current instance for method chaining
   */
  public setAdapterSending(adapter: `0x${string}`) {
    this.data.adapterSending = adapter;
    return this;
  }

  /**
   * Sets the adapter that received the CrosschainPayload.
   * 
   * @param {string} adapter - The adapter that received the CrosschainPayload
   * @returns {CrosschainPayloadService} Returns the current instance for method chaining
   */
  public setAdapterReceiving(adapter: `0x${string}`) {
    this.data.adapterReceiving = adapter;
    return this;
  }
}
