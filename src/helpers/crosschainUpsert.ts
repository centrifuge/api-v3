import type { SQL } from "drizzle-orm";
import {
  mergeClearOnExecute,
  mergeCoalesce,
  mergeEarliest,
  mergeSenderWins,
  mergeSenderWinsUnlessPlaceholder,
} from "./upsertMerge";
import { crosschainMessageStatusCase, crosschainPayloadStatusCase } from "./crosschainStatusCase";
import { nullTimestamperWithChain } from "./hubSpokeUpsert";

const MESSAGE_TABLE = "crosschain_message";
const PAYLOAD_TABLE = "crosschain_payload";

/** Insert-only sentinel for partial message upserts (must not win on conflict). */
export const CROSSCHAIN_MESSAGE_TYPE_STUB = "_Stub";
/** Insert-only sentinel for partial message/payload upserts (must not win on conflict). */
export const CROSSCHAIN_RAW_DATA_STUB = "0x";

/** Null fact columns referenced in message merge SET (Ponder excluded.* gate). */
export const NULL_CROSSCHAIN_MESSAGE_FACTS = {
  payloadId: null,
  payloadIndex: null,
  poolId: null,
  tokenId: null,
  failReason: null,
  executedAtChainId: null,
  ...nullTimestamperWithChain("prepared"),
  ...nullTimestamperWithChain("batched"),
  ...nullTimestamperWithChain("repaid"),
  ...nullTimestamperWithChain("failed"),
  ...nullTimestamperWithChain("executed"),
};

/** Null fact columns referenced in payload merge SET. */
export const NULL_CROSSCHAIN_PAYLOAD_FACTS = {
  poolId: null,
  tokenId: null,
  gasLimit: null,
  gasPrice: null,
  ...nullTimestamperWithChain("prepared"),
  ...nullTimestamperWithChain("repaid"),
  ...nullTimestamperWithChain("delivered"),
  ...nullTimestamperWithChain("completed"),
  ...nullTimestamperWithChain("partiallyFailed"),
};

/** Timestamp fact column base names on crosschain_message. */
const MESSAGE_TIMESTAMP_FACTS = ["prepared", "batched", "repaid", "failed", "executed"] as const;

/** Timestamp fact column base names on crosschain_payload. */
const PAYLOAD_TIMESTAMP_FACTS = [
  "prepared",
  "repaid",
  "delivered",
  "completed",
  "partiallyFailed",
] as const;

/**
 * Builds ON CONFLICT SET for crosschain_message fact merge + derived status.
 * @returns Conflict set map for Drizzle upsert
 */
export function buildCrosschainMessageConflictSet(): Record<string, SQL> {
  const set: Record<string, SQL> = {};

  for (const base of MESSAGE_TIMESTAMP_FACTS) {
    const pgAt = `${camelToSnake(base)}_at`;
    const pgBlock = `${camelToSnake(base)}_at_block`;
    const pgTx = `${camelToSnake(base)}_at_tx_hash`;
    const pgChain = `${camelToSnake(base)}_at_chain_id`;
    const tsKey = `${base}At`;
    set[`${tsKey}`] = mergeEarliest(MESSAGE_TABLE, pgAt);
    set[`${tsKey}Block`] = mergeCoalesce(MESSAGE_TABLE, pgBlock);
    set[`${tsKey}TxHash`] = mergeCoalesce(MESSAGE_TABLE, pgTx);
    set[`${tsKey}ChainId`] = mergeCoalesce(MESSAGE_TABLE, pgChain);
  }

  set.payloadId = mergeCoalesce(MESSAGE_TABLE, "payload_id");
  set.payloadIndex = mergeCoalesce(MESSAGE_TABLE, "payload_index");
  set.poolId = mergeCoalesce(MESSAGE_TABLE, "pool_id");
  set.tokenId = mergeCoalesce(MESSAGE_TABLE, "token_id");
  set.rawData = mergeSenderWinsUnlessPlaceholder(
    MESSAGE_TABLE,
    "raw_data",
    `'${CROSSCHAIN_RAW_DATA_STUB}'`
  );
  set.data = mergeSenderWins(MESSAGE_TABLE, "data");
  set.messageType = mergeSenderWinsUnlessPlaceholder(
    MESSAGE_TABLE,
    "message_type",
    `'${CROSSCHAIN_MESSAGE_TYPE_STUB}'`
  );
  set.hash = mergeCoalesce(MESSAGE_TABLE, "hash");
  set.fromCentrifugeId = mergeCoalesce(MESSAGE_TABLE, "from_centrifuge_id");
  set.toCentrifugeId = mergeCoalesce(MESSAGE_TABLE, "to_centrifuge_id");
  set.failedAt = mergeClearOnExecute(MESSAGE_TABLE, "failed_at");
  set.failedAtBlock = mergeClearOnExecute(MESSAGE_TABLE, "failed_at_block");
  set.failedAtTxHash = mergeClearOnExecute(MESSAGE_TABLE, "failed_at_tx_hash");
  set.failedAtChainId = mergeClearOnExecute(MESSAGE_TABLE, "failed_at_chain_id");
  set.failReason = mergeClearOnExecute(MESSAGE_TABLE, "fail_reason");
  set.status = crosschainMessageStatusCase();

  return set;
}

/**
 * Builds ON CONFLICT SET for crosschain_payload fact merge + derived status.
 * @returns Conflict set map for Drizzle upsert
 */
export function buildCrosschainPayloadConflictSet(): Record<string, SQL> {
  const set: Record<string, SQL> = {};

  for (const base of PAYLOAD_TIMESTAMP_FACTS) {
    const pgAt = `${camelToSnake(base)}_at`;
    const pgBlock = `${camelToSnake(base)}_at_block`;
    const pgTx = `${camelToSnake(base)}_at_tx_hash`;
    const pgChain = `${camelToSnake(base)}_at_chain_id`;
    const tsKey = `${base}At`;
    set[`${tsKey}`] = mergeEarliest(PAYLOAD_TABLE, pgAt);
    set[`${tsKey}Block`] = mergeCoalesce(PAYLOAD_TABLE, pgBlock);
    set[`${tsKey}TxHash`] = mergeCoalesce(PAYLOAD_TABLE, pgTx);
    set[`${tsKey}ChainId`] = mergeCoalesce(PAYLOAD_TABLE, pgChain);
  }

  set.poolId = mergeCoalesce(PAYLOAD_TABLE, "pool_id");
  set.tokenId = mergeCoalesce(PAYLOAD_TABLE, "token_id");
  set.rawData = mergeSenderWinsUnlessPlaceholder(
    PAYLOAD_TABLE,
    "raw_data",
    `'${CROSSCHAIN_RAW_DATA_STUB}'`
  );
  set.fromCentrifugeId = mergeCoalesce(PAYLOAD_TABLE, "from_centrifuge_id");
  set.toCentrifugeId = mergeCoalesce(PAYLOAD_TABLE, "to_centrifuge_id");
  set.gasLimit = mergeCoalesce(PAYLOAD_TABLE, "gas_limit");
  set.gasPrice = mergeCoalesce(PAYLOAD_TABLE, "gas_price");
  set.status = crosschainPayloadStatusCase();

  return set;
}

/**
 * Converts camelCase to snake_case for SQL column names.
 * @param s - camelCase string
 * @returns snake_case string
 */
function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}
