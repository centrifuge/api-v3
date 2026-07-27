import { AdapterWiring } from "ponder:schema";
import { Service, type DataWithoutDefaults } from "./Service";
import type { Context, Event } from "ponder:registry";
import { AdapterService } from "./AdapterService";
import { serviceLog } from "../helpers/logger";

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

  /**
   * Upserts a deferred wiring row when remote adapter is not yet indexed.
   * @param context - Ponder context
   * @param event - Source event
   * @param row - Partial wiring row with pending remote adapter
   * @returns Service instance or null
   */
  static async upsertDeferred(
    context: Context,
    row: Partial<DataWithoutDefaults<typeof AdapterWiring>> & {
      fromAddress: string;
      fromCentrifugeId: string;
      toAddress: string;
      toCentrifugeId: string;
      pendingRemoteAdapter: `0x${string}`;
    },
    event: Event
  ): Promise<AdapterWiringService | null> {
    return AdapterWiringService.upsert(
      context,
      {
        fromAddress: row.fromAddress,
        fromCentrifugeId: row.fromCentrifugeId,
        toAddress: row.pendingRemoteAdapter,
        toCentrifugeId: row.toCentrifugeId,
        pendingRemoteAdapter: row.pendingRemoteAdapter,
      },
      event
    );
  }

  /**
   * Completes deferred wirings when remote adapters exist.
   * @param context - Ponder context
   * @param remoteCentrifugeId - Remote chain id
   */
  static async reconcilePending(context: Context, remoteCentrifugeId: string): Promise<void> {
    const pending = (await AdapterWiringService.query(context, {
      toCentrifugeId: remoteCentrifugeId,
      wiredAt: null,
      pendingRemoteAdapter_not: null,
    })) as AdapterWiringService[];

    for (const wiring of pending) {
      const { pendingRemoteAdapter, fromAddress, fromCentrifugeId } = wiring.read();
      if (!pendingRemoteAdapter) continue;
      const remote = await AdapterService.get(context, {
        centrifugeId: remoteCentrifugeId,
        address: pendingRemoteAdapter,
      });
      if (!remote) continue;
      serviceLog(`AdapterWiring reconcile ${fromAddress} -> ${pendingRemoteAdapter}`);
      await AdapterWiringService.upsert(
        context,
        {
          fromAddress,
          fromCentrifugeId,
          toAddress: pendingRemoteAdapter,
          toCentrifugeId: remoteCentrifugeId,
          pendingRemoteAdapter: null,
        },
        null
      );
    }
  }
}
