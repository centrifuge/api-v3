import type { Context, Event } from "ponder:registry";
import { PoolAdapter, PoolAdapterCrosschainInProgressTypes } from "ponder:schema";
import { serviceError, serviceLog } from "../helpers/logger";
import { formatBytes32ToAddress } from "../helpers/formatter";
import { Service } from "./Service";

type PoolAdapterKey = {
  localCentrifugeId: string;
  remoteCentrifugeId: string;
  poolId: bigint;
};

type SetPoolAdaptersMessageData = {
  poolId: bigint;
  adapterAddresses: `0x${string}`[];
};

/**
 * Service for pool-to-adapter mappings on a specific local/remote chain pair.
 */
export class PoolAdapterService extends Service<typeof PoolAdapter> {
  static readonly entityTable = PoolAdapter;
  static readonly entityName = "PoolAdapter";

  /** Sets whether the adapter is active in the latest local mapping. */
  public setEnabled(isEnabled: boolean) {
    this.data.isEnabled = isEnabled;
    serviceLog(`Setting isEnabled to ${isEnabled}`);
    return this;
  }

  /** Sets or clears the pending remote enable/disable transition. */
  public setCrosschainInProgress(
    crosschainInProgress?: (typeof PoolAdapterCrosschainInProgressTypes)[number]
  ) {
    this.data.crosschainInProgress = crosschainInProgress ?? null;
    serviceLog(`Setting crosschainInProgress to ${crosschainInProgress}`);
    return this;
  }

  /** Applies the authoritative local `SetAdapters` event for a chain/pool/remote set. */
  static async syncFromSetAdapters(
    context: Context,
    input: PoolAdapterKey & { adapterAddresses: `0x${string}`[] },
    event: Event
  ) {
    const { localCentrifugeId, remoteCentrifugeId, poolId } = input;
    const adapterAddresses = this.normalizeAddresses(input.adapterAddresses);
    serviceLog(
      `Syncing PoolAdapter mapping for ${localCentrifugeId}->${remoteCentrifugeId} pool ${poolId}`
    );

    const existing = await this.getSetRows(context, {
      localCentrifugeId,
      remoteCentrifugeId,
      poolId,
    });
    const existingByAddress = new Map(
      existing.map((poolAdapter) => [poolAdapter.read().adapterAddress.toLowerCase(), poolAdapter])
    );
    const nextAddresses = new Set(adapterAddresses);
    const instances: PoolAdapterService[] = [];

    for (const poolAdapter of existing) {
      const { adapterAddress } = poolAdapter.read();
      const normalizedAddress = adapterAddress.toLowerCase() as `0x${string}`;
      poolAdapter.setEnabled(nextAddresses.has(normalizedAddress)).setCrosschainInProgress();
      instances.push(poolAdapter);
    }

    for (const adapterAddress of adapterAddresses) {
      if (existingByAddress.has(adapterAddress)) continue;
      const poolAdapter = (await this.insert(
        context,
        {
          localCentrifugeId,
          remoteCentrifugeId,
          poolId,
          adapterAddress,
          isEnabled: true,
          crosschainInProgress: null,
        },
        event,
        true
      )) as PoolAdapterService | null;
      if (!poolAdapter) continue;
      instances.push(poolAdapter);
    }

    if (instances.length > 0) await this.saveMany(context, instances, event);
  }

  /** Marks destination-side rows as pending based on an outbound `SetPoolAdapters` message. */
  static async setCrosschainInProgressFromMessage(
    context: Context,
    input: PoolAdapterKey & {
      adapterAddresses: `0x${string}`[];
      enabledTransition: boolean;
    },
    event: Event
  ) {
    const { localCentrifugeId, remoteCentrifugeId, poolId, enabledTransition } = input;
    const adapterAddresses = this.normalizeAddresses(input.adapterAddresses);
    serviceLog(
      `Marking PoolAdapter crosschainInProgress for ${localCentrifugeId}->${remoteCentrifugeId} pool ${poolId}`
    );

    const existing = await this.getSetRows(context, {
      localCentrifugeId,
      remoteCentrifugeId,
      poolId,
    });
    const existingByAddress = new Map(
      existing.map((poolAdapter) => [poolAdapter.read().adapterAddress.toLowerCase(), poolAdapter])
    );
    const nextAddresses = new Set(adapterAddresses);
    const transition: (typeof PoolAdapterCrosschainInProgressTypes)[number] = enabledTransition
      ? "Enabled"
      : "Disabled";
    const inverseTransition: (typeof PoolAdapterCrosschainInProgressTypes)[number] =
      enabledTransition ? "Disabled" : "Enabled";
    const instances: PoolAdapterService[] = [];

    for (const poolAdapter of existing) {
      const { adapterAddress } = poolAdapter.read();
      const normalizedAddress = adapterAddress.toLowerCase() as `0x${string}`;
      poolAdapter.setCrosschainInProgress(
        nextAddresses.has(normalizedAddress) ? transition : inverseTransition
      );
      instances.push(poolAdapter);
    }

    for (const adapterAddress of adapterAddresses) {
      if (existingByAddress.has(adapterAddress)) continue;
      const poolAdapter = (await this.insert(
        context,
        {
          localCentrifugeId,
          remoteCentrifugeId,
          poolId,
          adapterAddress,
          isEnabled: false,
          crosschainInProgress: transition,
        },
        event,
        true
      )) as PoolAdapterService | null;
      if (!poolAdapter) continue;
      instances.push(poolAdapter);
    }

    if (instances.length > 0) await this.saveMany(context, instances, event);
  }

  /** Clears pending remote state for a chain/pool/remote set. */
  static async clearCrosschainInProgress(context: Context, input: PoolAdapterKey, event: Event) {
    const existing = await this.getSetRows(context, input);
    const instances = existing.filter(
      (poolAdapter) => poolAdapter.read().crosschainInProgress != null
    );
    for (const poolAdapter of instances) poolAdapter.setCrosschainInProgress();
    if (instances.length > 0) await this.saveMany(context, instances, event);
  }

  /** Parses decoded `SetPoolAdapters` message data into a pool id and remote adapter addresses. */
  static parseSetPoolAdaptersMessageData(data: unknown): SetPoolAdaptersMessageData | null {
    if (!data || typeof data !== "object") return null;

    const poolIdValue = "poolId" in data ? data.poolId : undefined;
    const adapterListValue = "adapterList" in data ? data.adapterList : undefined;
    if (
      (typeof poolIdValue !== "string" &&
        typeof poolIdValue !== "number" &&
        typeof poolIdValue !== "bigint") ||
      typeof adapterListValue !== "string"
    ) {
      return null;
    }

    try {
      return {
        poolId: BigInt(poolIdValue),
        adapterAddresses: this.decodeAdapterList(adapterListValue as `0x${string}`),
      };
    } catch (error) {
      serviceError(
        `Failed to parse SetPoolAdapters message data: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  /** Loads all pool-adapter rows for one local/remote/pool set. */
  private static async getSetRows(context: Context, input: PoolAdapterKey) {
    return (await this.query(context, {
      localCentrifugeId: input.localCentrifugeId,
      remoteCentrifugeId: input.remoteCentrifugeId,
      poolId: input.poolId,
    })) as PoolAdapterService[];
  }

  /** Lowercases and deduplicates adapter addresses. */
  private static normalizeAddresses(adapterAddresses: `0x${string}`[]) {
    return Array.from(
      new Set(
        adapterAddresses.map((adapterAddress) => adapterAddress.toLowerCase() as `0x${string}`)
      )
    );
  }

  /** Decodes the bytes payload used by `SetPoolAdapters` into adapter addresses. */
  private static decodeAdapterList(adapterList: `0x${string}`) {
    const hex = adapterList.slice(2).toLowerCase();
    if (hex.length < 4) return [] as `0x${string}`[];

    const adapterCount = Number.parseInt(hex.slice(0, 4), 16);
    const addresses: `0x${string}`[] = [];
    let offset = 4;
    for (let i = 0; i < adapterCount; i++) {
      const word = hex.slice(offset, offset + 64);
      if (word.length !== 64) {
        throw new Error(`Invalid adapterList length for adapter index ${i}`);
      }
      addresses.push(formatBytes32ToAddress(`0x${word}`));
      offset += 64;
    }
    return this.normalizeAddresses(addresses);
  }
}
