import { Context, Event } from "ponder:registry";
import { Transaction } from "ponder:schema";
import { Service } from "./Service";
import { BlockchainService } from "./BlockchainService";
import { serviceError, serviceWarn } from "../helpers/logger";

/**
 * Receipt fields consumed for gas accounting. Receipts are enabled runtime-only via
 * `includeTransactionReceipts` (see decorateDeploymentContracts), so `event.transactionReceipt`
 * is absent from Ponder's event types and is read through this structural shape instead.
 */
type GasReceipt = {
  gasUsed: bigint;
  effectiveGasPrice: bigint;
};

/**
 * Service for the per-transaction gas-cost ledger. One row per (chainId, txHash); every indexed
 * log event of a transaction merges into the same row, so `events` describes what the
 * transaction did and `gasCost` what it cost.
 */
export class TransactionService extends Service<typeof Transaction> {
  static readonly entityTable = Transaction;
  static readonly entityName = "Transaction";

  /**
   * Records the emitting transaction of an indexed log event into the gas-cost ledger.
   * Inserts on the first event of a transaction; subsequent events merge-append their labels
   * and attributions (value-deduplicated, so replays and reorg re-processing are idempotent).
   * Never throws: gas accounting must not block domain indexing.
   * @param context - The database and client context
   * @param event - The indexed event; setup and block events (no transaction) are skipped
   * @param eventLabel - Unversioned event label, e.g. "hub:NotifyPool"
   */
  static async record(context: Context, event: Event, eventLabel: string) {
    try {
      if (!("transaction" in event) || !("log" in event)) return;
      // Runtime-only receipt access; see GasReceipt above.
      const receipt = (event as { transactionReceipt?: GasReceipt }).transactionReceipt;
      if (!receipt) {
        serviceWarn(
          `Transaction record skipped for ${eventLabel}: no receipt on event — is includeTransactionReceipts enabled for this contract?`
        );
        return;
      }

      const chainId = context.chain.id;
      const blockTime = new Date(Number(event.block.timestamp) * 1000);
      const contractAddress = event.log.address.toLowerCase();
      const { poolIds, tokenIds } = extractIdsFromArgs(event.args);
      const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;

      await context.db
        .insert(Transaction)
        .values({
          chainId,
          txHash: event.transaction.hash,
          centrifugeId: BlockchainService.getCentrifugeIdFromChainId(chainId),
          blockNumber: Number(event.block.number),
          timestamp: blockTime,
          fromAddress: event.transaction.from.toLowerCase() as `0x${string}`,
          toAddress: (event.transaction.to?.toLowerCase() as `0x${string}` | undefined) ?? null,
          gasUsed: receipt.gasUsed,
          effectiveGasPrice: receipt.effectiveGasPrice,
          gasCost,
          events: [eventLabel],
          contracts: [contractAddress],
          poolIds,
          tokenIds,
          createdAt: blockTime,
          updatedAt: blockTime,
        })
        .onConflictDoUpdate((row) => ({
          events: appendUnique(row.events, [eventLabel]),
          contracts: appendUnique(row.contracts, [contractAddress]),
          poolIds: appendUnique(row.poolIds, poolIds),
          tokenIds: appendUnique(row.tokenIds, tokenIds),
          updatedAt: blockTime,
        }));
    } catch (error) {
      serviceError(`Transaction record failed for ${eventLabel}: ${String(error)}`);
    }
  }
}

/**
 * Appends values to an existing list, preserving first-seen order and dropping duplicates.
 * Exported for unit testing.
 * @param existing - Values already on the row
 * @param additions - Candidate values from the current event
 * @returns The merged list
 */
export function appendUnique(existing: string[], additions: string[]): string[] {
  const merged = [...existing];
  for (const value of additions) {
    if (!merged.includes(value)) merged.push(value);
  }
  return merged;
}

/**
 * Best-effort pool / share-class attribution from event args. Reads `poolId` (decimal string)
 * and `scId` / `shareClassId` (bytes16 hex of the share class token). Deliberately ignores
 * `tokenId`, which in ERC-6909 contexts is an asset sub-identifier, not a share class.
 * Events resolving pool context indirectly (e.g. share token transfers) yield empty arrays.
 * Exported for unit testing.
 * @param args - The event args, if any
 * @returns Pool and share-class ids touched by the event
 */
export function extractIdsFromArgs(args: unknown): { poolIds: string[]; tokenIds: string[] } {
  const poolIds: string[] = [];
  const tokenIds: string[] = [];
  if (typeof args === "object" && args !== null && !Array.isArray(args)) {
    const record = args as Record<string, unknown>;
    if (typeof record["poolId"] === "bigint") poolIds.push(record["poolId"].toString());
    const shareClassId = record["scId"] ?? record["shareClassId"];
    if (typeof shareClassId === "string" && shareClassId.startsWith("0x")) {
      tokenIds.push(shareClassId.toLowerCase());
    }
  }
  return { poolIds, tokenIds };
}
