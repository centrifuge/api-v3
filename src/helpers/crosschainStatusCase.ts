import { sql, type SQL } from "drizzle-orm";
import { quotePgEnumType } from "./upsertMerge";

const MESSAGE_TABLE = "crosschain_message";
const PAYLOAD_TABLE = "crosschain_payload";

/**
 * Recomputes crosschain_message.status from merged row + excluded facts.
 * @returns SQL for ON CONFLICT DO UPDATE SET status
 */
export function crosschainMessageStatusCase(): SQL {
  const t = MESSAGE_TABLE;
  const status = quotePgEnumType("crosschain_message_status");
  return sql.raw(`
    CASE
      WHEN ${t}.executed_at IS NOT NULL OR excluded.executed_at IS NOT NULL
      THEN 'Executed'::${status}
      WHEN ${t}.failed_at IS NOT NULL OR excluded.failed_at IS NOT NULL
      THEN 'Failed'::${status}
      WHEN COALESCE(${t}.payload_id, excluded.payload_id) IS NOT NULL
       AND COALESCE(${t}.prepared_at, excluded.prepared_at) IS NULL
       AND COALESCE(${t}.repaid_at, excluded.repaid_at) IS NULL
      THEN 'Unsent'::${status}
      WHEN COALESCE(${t}.payload_id, excluded.payload_id) IS NOT NULL
      THEN 'AwaitingBatchDelivery'::${status}
      WHEN COALESCE(${t}.prepared_at, excluded.prepared_at) IS NOT NULL
      THEN 'AwaitingBatchDelivery'::${status}
      ELSE 'AwaitingBatchDelivery'::${status}
    END
  `);
}

/**
 * Recomputes crosschain_payload.status from merged row + excluded facts.
 * @returns SQL for ON CONFLICT DO UPDATE SET status
 */
export function crosschainPayloadStatusCase(): SQL {
  const t = PAYLOAD_TABLE;
  const status = quotePgEnumType("crosschain_payload_status");
  return sql.raw(`
    CASE
      WHEN COALESCE(${t}.completed_at, excluded.completed_at) IS NOT NULL
      THEN 'Completed'::${status}
      WHEN COALESCE(${t}.partially_failed_at, excluded.partially_failed_at) IS NOT NULL
      THEN 'PartiallyFailed'::${status}
      WHEN COALESCE(${t}.delivered_at, excluded.delivered_at) IS NOT NULL
      THEN 'Delivered'::${status}
      WHEN COALESCE(${t}.repaid_at, excluded.repaid_at) IS NOT NULL
      THEN 'InTransit'::${status}
      WHEN COALESCE(${t}.prepared_at, excluded.prepared_at) IS NOT NULL
      THEN 'Underpaid'::${status}
      ELSE 'Underpaid'::${status}
    END
  `);
}

/**
 * Default status for first insert of a crosschain message (no facts yet).
 * @param hasPrepared - Whether preparedAt is set on insert
 * @param hasPayload - Whether payloadId is set on insert
 * @returns Initial status string
 */
export function defaultCrosschainMessageStatus(
  hasPrepared: boolean,
  hasPayload: boolean
): "Unsent" | "AwaitingBatchDelivery" {
  if (hasPayload && !hasPrepared) return "Unsent";
  if (hasPrepared || hasPayload) return "AwaitingBatchDelivery";
  return "AwaitingBatchDelivery";
}
