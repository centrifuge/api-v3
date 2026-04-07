import { Adapter } from "ponder:schema";
import { Service } from "./Service";

/**
 * Service class for managing Adapter entities in the database.
 *
 * Adapters represent the bridge between different blockchain networks and the protocol.
 * Each adapter has a unique address and centrifuge ID, and is associated with a specific
 * pool or asset.
 *
 * This service provides CRUD operations and database interaction utilities for Adapter entities,
 * extending the abstract [`Service`](./Service.ts) base (standard entity statics).
 *
 * @example
 * ```typescript
 * // Create a new adapter
 * const adapter = await AdapterService.init(context, {
 *   address: "0x...",
 *   centrifugeId: "centrifuge:123",
 *   // ... other adapter properties
 * });
 * ```
 *
 * @extends {Service<typeof Adapter>}
 * @see {@link Service} Base service class for common CRUD operations
 * @see {@link Adapter} Adapter entity schema definition
 */
export class AdapterService extends Service<typeof Adapter> {
  static readonly entityTable = Adapter;
  static readonly entityName = "Adapter";
}
