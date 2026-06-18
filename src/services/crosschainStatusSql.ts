import { getTableColumns, sql, type SQL } from "drizzle-orm";
import { AdapterParticipation, CrosschainMessage, CrosschainPayload } from "ponder:schema";
import { quotePgEnumType, quotePgIdent } from "../helpers/upsertMerge";
import {
  assertHexBytes32,
  assertPayloadStatusReceiveAnchor,
  assertPgIdentSegment,
  assertSafePayloadIndex,
  bindPgHexBytes32,
  bindPgInteger,
  bindPgTimestamp,
} from "../helpers/sqlSafety";

const PAYLOAD_TABLE = "crosschain_payload";
const MESSAGE_TABLE = "crosschain_message";
const PAYLOAD_STATUS_ENUM = "crosschain_payload_status";
const MESSAGE_STATUS_ENUM = "crosschain_message_status";
const ADAPTER_PARTICIPATION_SIDE_ENUM = "adapter_participation_side";

/**
 * FILTER predicate for adapter_participation side counts (enum column name differs from TS key).
 * @param side - SEND or HANDLE
 * @returns Raw SQL comparison fragment (static identifiers only)
 */
function adapterParticipationSideFilterSql(side: "SEND" | "HANDLE"): string {
  const sideCol = quotePgIdent(getTableColumns(AdapterParticipation).side.name);
  const sideEnum = quotePgEnumType(ADAPTER_PARTICIPATION_SIDE_ENUM);
  return `${sideCol} = '${side}'::${sideEnum}`;
}

/**
 * SQL CASE for crosschain_message.status on upsert conflict SET.
 * @returns Raw SQL fragment assigning status from merged row facts
 */
export function messageStatusSetSql(): SQL {
  assertPgIdentSegment(MESSAGE_TABLE, "table");
  const t = quotePgIdent(MESSAGE_TABLE);
  const status = quotePgEnumType(MESSAGE_STATUS_ENUM);
  return sql.raw(`
    CASE
      WHEN ${t}.executed_at IS NOT NULL OR excluded.executed_at IS NOT NULL
      THEN 'Executed'::${status}
      WHEN ${t}.failed_at IS NOT NULL OR excluded.failed_at IS NOT NULL
      THEN 'Failed'::${status}
      WHEN COALESCE(${t}.payload_id, excluded.payload_id) IS NOT NULL
      THEN 'AwaitingBatchDelivery'::${status}
      WHEN COALESCE(${t}.prepared_at, excluded.prepared_at) IS NOT NULL
      THEN 'AwaitingBatchDelivery'::${status}
      ELSE 'AwaitingBatchDelivery'::${status}
    END
  `);
}

/**
 * SQL CASE for crosschain_payload.status from timestamp facts only (sender upserts).
 * @returns Raw SQL fragment for ON CONFLICT DO UPDATE SET status
 */
export function payloadSimpleStatusSetSql(): SQL {
  assertPgIdentSegment(PAYLOAD_TABLE, "table");
  const t = quotePgIdent(PAYLOAD_TABLE);
  const status = quotePgEnumType(PAYLOAD_STATUS_ENUM);
  return sql.raw(`
    CASE
      WHEN COALESCE(${t}.completed_at, excluded.completed_at) IS NOT NULL
      THEN 'Completed'::${status}
      WHEN COALESCE(${t}.partially_failed_at, excluded.partially_failed_at) IS NOT NULL
      THEN 'PartiallyFailed'::${status}
      WHEN COALESCE(${t}.delivered_at, excluded.delivered_at) IS NOT NULL
      THEN 'Delivered'::${status}
      WHEN COALESCE(${t}.sent_at, excluded.sent_at) IS NOT NULL
      THEN 'InTransit'::${status}
      WHEN COALESCE(${t}.underpaid_at, excluded.underpaid_at) IS NOT NULL
      THEN 'Underpaid'::${status}
      ELSE 'Underpaid'::${status}
    END
  `);
}

/**
 * SQL CASE for crosschain_payload.status from aggregate UPDATE row (alias `p`).
 * @returns Raw SQL fragment (static identifiers only)
 */
function payloadAggregateStatusCaseSql(): string {
  const status = quotePgEnumType(PAYLOAD_STATUS_ENUM);
  return `
    CASE
      WHEN p.completed_at IS NOT NULL THEN 'Completed'::${status}
      WHEN p.partially_failed_at IS NOT NULL THEN 'PartiallyFailed'::${status}
      WHEN p.delivered_at IS NOT NULL THEN 'Delivered'::${status}
      WHEN p.sent_at IS NOT NULL THEN 'InTransit'::${status}
      WHEN p.underpaid_at IS NOT NULL THEN 'Underpaid'::${status}
      ELSE 'Underpaid'::${status}
    END
  `;
}

/**
 * Quoted payload status column (TS key `status` → DB `crosschain_payload_status`).
 * @returns Double-quoted PostgreSQL identifier
 */
function quotedPayloadStatusColumn(): string {
  return quotePgIdent(getTableColumns(CrosschainPayload).status.name);
}

/** Anchor timestamps for derived payload facts in aggregate UPDATE. */
export type PayloadStatusReceiveAnchor = {
  receivedAt: Date;
  receivedAtBlock: number;
  receivedAtTxHash: `0x${string}`;
  receivedAtChainId: number;
};

/**
 * Builds a single UPDATE that recomputes payload derived facts and status from SQL aggregates.
 *
 * Security: chain/event values are bound via Drizzle `sql` parameters (`${...}`).
 * `sql.raw` is limited to static CASE fragments; table names use Drizzle table refs.
 * Dynamic values MUST use `bindPg*` from [`sqlSafety.ts`](../helpers/sqlSafety.ts) — see
 * `test/parity/raw-sql-bindings.test.ts`.
 * @param anchor - Receive event anchor for newly set derived timestamps
 * @param payloadId - Payload id
 * @param payloadIndex - Payload index
 * @param options - Whether to set deliveredAt from anchor (first gateway message receive)
 * @returns Parameterized SQL statement
 */
export function refreshPayloadStatusSql(
  anchor: PayloadStatusReceiveAnchor,
  payloadId: `0x${string}`,
  payloadIndex: number,
  options: { setDeliveredFromAnchor?: boolean } = {}
): SQL {
  assertPayloadStatusReceiveAnchor(anchor);
  assertHexBytes32(payloadId, "payloadId");
  assertSafePayloadIndex(payloadIndex);

  const statusCase = payloadAggregateStatusCaseSql();
  const payloadStatusCol = quotedPayloadStatusColumn();
  const receivedAtTs = bindPgTimestamp(anchor.receivedAt);
  const receivedAtBlock = bindPgInteger(anchor.receivedAtBlock);
  const receivedAtChainId = bindPgInteger(anchor.receivedAtChainId);
  const receivedAtTxHash = bindPgHexBytes32(anchor.receivedAtTxHash);
  const payloadIdHex = bindPgHexBytes32(payloadId);
  const payloadIndexInt = bindPgInteger(payloadIndex);

  const deliveredAtExpr = options.setDeliveredFromAnchor
    ? sql`COALESCE(p.delivered_at, ${receivedAtTs})`
    : sql`p.delivered_at`;

  const deliveredSet = options.setDeliveredFromAnchor
    ? sql`
        delivered_at = COALESCE(p.delivered_at, ${receivedAtTs}),
        delivered_at_block = COALESCE(p.delivered_at_block, ${receivedAtBlock}),
        delivered_at_tx_hash = COALESCE(p.delivered_at_tx_hash, ${receivedAtTxHash}),
      `
    : sql``;

  return sql`
    UPDATE ${CrosschainPayload} AS p
    SET
      ${deliveredSet}
      partially_failed_at = COALESCE(
        p.partially_failed_at,
        CASE WHEN ${deliveredAtExpr} IS NOT NULL AND agg.failed > 0 THEN ${receivedAtTs} END
      ),
      partially_failed_at_block = COALESCE(
        p.partially_failed_at_block,
        CASE WHEN ${deliveredAtExpr} IS NOT NULL AND agg.failed > 0 THEN ${receivedAtBlock} END
      ),
      partially_failed_at_tx_hash = COALESCE(
        p.partially_failed_at_tx_hash,
        CASE WHEN ${deliveredAtExpr} IS NOT NULL AND agg.failed > 0 THEN ${receivedAtTxHash} END
      ),
      partially_failed_at_chain_id = COALESCE(
        p.partially_failed_at_chain_id,
        CASE WHEN ${deliveredAtExpr} IS NOT NULL AND agg.failed > 0 THEN ${receivedAtChainId} END
      ),
      completed_at = COALESCE(
        p.completed_at,
        CASE
          WHEN agg.adapter_ok AND agg.total > 0 AND agg.executed = agg.total
          THEN ${receivedAtTs}
        END
      ),
      completed_at_block = COALESCE(
        p.completed_at_block,
        CASE
          WHEN agg.adapter_ok AND agg.total > 0 AND agg.executed = agg.total
          THEN ${receivedAtBlock}
        END
      ),
      completed_at_tx_hash = COALESCE(
        p.completed_at_tx_hash,
        CASE
          WHEN agg.adapter_ok AND agg.total > 0 AND agg.executed = agg.total
          THEN ${receivedAtTxHash}
        END
      ),
      ${sql.raw(`${payloadStatusCol} = ${statusCase.trim()}`)}
    FROM (
      SELECT
        COALESCE(msg_counts.total, 0) AS total,
        COALESCE(msg_counts.executed, 0) AS executed,
        COALESCE(msg_counts.failed, 0) AS failed,
        COALESCE(ap_counts.send_count, 0) = COALESCE(ap_counts.handle_count, 0)
          AND COALESCE(ap_counts.send_count, 0) > 0 AS adapter_ok
      FROM (
        SELECT
          COUNT(*)::integer AS total,
          COUNT(*) FILTER (WHERE executed_at IS NOT NULL)::integer AS executed,
          COUNT(*) FILTER (WHERE failed_at IS NOT NULL)::integer AS failed
        FROM ${CrosschainMessage}
        WHERE payload_id = ${payloadIdHex} AND payload_index = ${payloadIndexInt}
      ) AS msg_counts
      CROSS JOIN (
        SELECT
          COUNT(*) FILTER (WHERE ${sql.raw(adapterParticipationSideFilterSql("SEND"))})::integer AS send_count,
          COUNT(*) FILTER (WHERE ${sql.raw(adapterParticipationSideFilterSql("HANDLE"))})::integer AS handle_count
        FROM ${AdapterParticipation}
        WHERE payload_id = ${payloadIdHex} AND payload_index = ${payloadIndexInt}
      ) AS ap_counts
    ) AS agg
    WHERE p.id = ${payloadIdHex} AND p.index = ${payloadIndexInt}
  `;
}
