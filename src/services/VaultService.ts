import { Vault, VaultCrosschainInProgressTypes } from "ponder:schema";
import { Service, type DataWithoutDefaults } from "./Service";
import { VaultStatuses } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import type { Context, Event } from "ponder:registry";
import { timestamperWithChain } from "../helpers/timestamper";
import { upsertHubSpokeFacts } from "../helpers/hubSpokeUpsert";

/**
 * Service class for managing Vault entities.
 *
 * Extends the base Service class with Vault-specific functionality and common static methods.
 * Provides methods for vault status management and other vault-related operations.
 *
 * @extends {Service<typeof Vault>}
 */
export class VaultService extends Service<typeof Vault> {
  static readonly entityTable = Vault;
  static readonly entityName = "Vault";

  /**
   * Upserts hub signal facts and derived crosschainInProgress.
   * @param context - Ponder context
   * @param event - Hub event
   * @param key - Vault PK
   * @param hubSignalType - Signal enum value
   * @param stubs - Optional domain fields for first insert
   * @returns Vault service instance
   */
  static async upsertHubSignal(
    context: Context,
    event: Extract<Event, { transaction: { hash: `0x${string}` } }>,
    key: { id: `0x${string}`; centrifugeId: string },
    hubSignalType: (typeof VaultCrosschainInProgressTypes)[number],
    stubs: Partial<DataWithoutDefaults<typeof Vault>> = {}
  ): Promise<VaultService> {
    const ts = new Date(Number(event.block.timestamp) * 1000);
    return upsertHubSpokeFacts(
      context,
      event,
      Vault,
      "vault",
      VaultService,
      "Vault",
      "hub",
      {
        poolId: stubs.poolId ?? 0n,
        tokenId: stubs.tokenId ?? (`0x${"00".repeat(32)}` as `0x${string}`),
        assetId: stubs.assetId ?? 0n,
        isActive: stubs.isActive ?? false,
        ...stubs,
        ...key,
        hubSignalType,
        ...timestamperWithChain("hubSignal", event, context.chain.id),
        createdAt: ts,
        createdAtBlock: Number(event.block.number),
        createdAtTxHash: event.transaction.hash,
        updatedAt: ts,
        updatedAtBlock: Number(event.block.number),
        updatedAtTxHash: event.transaction.hash,
      }
    );
  }

  /**
   * Upserts spoke ack facts and derived crosschainInProgress.
   * @param context - Ponder context
   * @param event - Spoke event
   * @param key - Vault PK
   * @param stubs - Optional domain fields
   * @returns Vault service instance
   */
  static async upsertSpokeAck(
    context: Context,
    event: Extract<Event, { transaction: { hash: `0x${string}` } }>,
    key: { id: `0x${string}`; centrifugeId: string },
    stubs: Partial<DataWithoutDefaults<typeof Vault>> = {}
  ): Promise<VaultService> {
    const ts = new Date(Number(event.block.timestamp) * 1000);
    return upsertHubSpokeFacts(
      context,
      event,
      Vault,
      "vault",
      VaultService,
      "Vault",
      "spoke",
      {
        poolId: stubs.poolId ?? 0n,
        tokenId: stubs.tokenId ?? (`0x${"00".repeat(32)}` as `0x${string}`),
        assetId: stubs.assetId ?? 0n,
        isActive: stubs.isActive ?? false,
        ...stubs,
        ...key,
        ...timestamperWithChain("spokeAck", event, context.chain.id),
        createdAt: ts,
        createdAtBlock: Number(event.block.number),
        createdAtTxHash: event.transaction.hash,
        updatedAt: ts,
        updatedAtBlock: Number(event.block.number),
        updatedAtTxHash: event.transaction.hash,
      }
    );
  }

  /**
   * Sets the status of the vault.
   *
   * Updates the vault's status to the specified value and returns the service instance
   * for method chaining.
   *
   * @param {VaultStatuses[number]} status - The new status to set for the vault
   * @returns {VaultService} The current service instance for method chaining
   *
   * @example
   * ```typescript
   * const vaultService = new VaultService();
   * vaultService.setStatus('active');
   * ```
   */
  public setStatus(status: (typeof VaultStatuses)[number]) {
    serviceLog(`Setting status to ${status}`);
    this.data.status = status;
    return this;
  }

  /**
   * Sets the crosschain progress for the vault.
   *
   * @param crosschainInProgress - The value to set for crosschainInProgress
   * @returns The service instance for method chaining
   */
  public setCrosschainInProgress(
    crosschainInProgress?: (typeof VaultCrosschainInProgressTypes)[number],
    crosschainInProgressValue?: bigint
  ) {
    this.data.crosschainInProgress = crosschainInProgress ?? null;
    this.data.crosschainInProgressValue = crosschainInProgressValue ?? null;
    serviceLog(
      `Setting crosschainInProgress to ${crosschainInProgress} with value ${crosschainInProgressValue}`
    );
    return this;
  }

  /**
   * Sets the max reserve for the vault.
   *
   * @param maxReserve - The value to set for maxReserve
   * @returns The service instance for method chaining
   */
  public setMaxReserve(maxReserve: bigint) {
    this.data.maxReserve = maxReserve;
    serviceLog(`Setting maxReserve to ${maxReserve}`);
    return this;
  }
}
