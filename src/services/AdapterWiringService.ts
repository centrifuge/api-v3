import { AdapterWiring } from "ponder:schema";
import { Service } from "./Service";

/**
 * Service class for managing AdapterWiring entities in the database.
 *
 * Adapter wirings represent the bridge between different adapters.
 * Each adapter wiring has a composite primary key consisting of fromAddress, fromCentrifugeId,
 * toAddress, and toCentrifugeId, and is associated with a specific from adapter and to adapter.
 *
 * This service provides CRUD operations and database interaction utilities for AdapterWiring entities,
 * extending the abstract [`Service`](./Service.ts) base (standard entity statics).
 *
 * @example
 * ```typescript
 * // Create a new adapter wiring
 * const adapterWiring = await AdapterWiringService.insert(context, {
 *   fromAddress: "0x...",
 *   fromCentrifugeId: "centrifuge:123",
 *   toAddress: "0x...",
 *   toCentrifugeId: "centrifuge:456",
 * }, event);
 * ```
 *
 * @extends {Service<typeof AdapterWiring>}
 * @see {@link Service} Base service class for common CRUD operations
 * @see {@link AdapterWiring} AdapterWiring entity schema definition
 */
export class AdapterWiringService extends Service<typeof AdapterWiring> {
  static readonly entityTable = AdapterWiring;
  static readonly entityName = "AdapterWiring";
}
