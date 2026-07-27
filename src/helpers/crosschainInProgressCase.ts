import { sql, type SQL } from "drizzle-orm";
import { quotePgEnumType, quotePgIdent } from "./upsertMerge";

/** Hub/spoke fact PostgreSQL column names (per-table enum names differ). */
export type HubSpokePgCols = {
  hubSignalType: string;
  hubSignalAt: string;
  spokeAckAt: string;
};

/**
 * Recomputes crosschainInProgress after a hub-signal upsert (excluded = hub facts only).
 * @param tablePgName - PostgreSQL table name (e.g. vault)
 * @param cols - Resolved hub/spoke fact column names
 * @returns SQL for ON CONFLICT DO UPDATE SET crosschain_in_progress
 */
export function crosschainInProgressCaseFromHub(tablePgName: string, cols: HubSpokePgCols): SQL {
  const t = quotePgIdent(tablePgName);
  const hubAt = quotePgIdent(cols.hubSignalAt);
  const hubType = quotePgIdent(cols.hubSignalType);
  const spokeAt = quotePgIdent(cols.spokeAckAt);
  return sql.raw(`
    CASE
      WHEN COALESCE(${t}.${hubAt}, excluded.${hubAt}) IS NOT NULL
       AND (
         ${t}.${spokeAt} IS NULL
         OR ${t}.${spokeAt} < COALESCE(${t}.${hubAt}, excluded.${hubAt})
       )
      THEN COALESCE(excluded.${hubType}, ${t}.${hubType})
      ELSE NULL
    END
  `);
}

/**
 * Recomputes crosschainInProgress after a spoke-ack upsert (excluded = spoke facts only).
 * @param tablePgName - PostgreSQL table name (e.g. vault)
 * @param cols - Resolved hub/spoke fact column names
 * @returns SQL for ON CONFLICT DO UPDATE SET crosschain_in_progress
 */
export function crosschainInProgressCaseFromSpoke(tablePgName: string, cols: HubSpokePgCols): SQL {
  const t = quotePgIdent(tablePgName);
  const hubAt = quotePgIdent(cols.hubSignalAt);
  const hubType = quotePgIdent(cols.hubSignalType);
  const spokeAt = quotePgIdent(cols.spokeAckAt);
  return sql.raw(`
    CASE
      WHEN ${t}.${hubAt} IS NOT NULL
       AND (
         COALESCE(${t}.${spokeAt}, excluded.${spokeAt}) IS NULL
         OR COALESCE(${t}.${spokeAt}, excluded.${spokeAt}) < ${t}.${hubAt}
       )
      THEN ${t}.${hubType}
      ELSE NULL
    END
  `);
}

/**
 * Basin redeem request state from fact timestamps.
 * @returns SQL for ON CONFLICT DO UPDATE SET state
 */
export function basinRedeemRequestStateCase(): SQL {
  const t = "basin_redeem_request";
  const state = quotePgEnumType("basin_redeem_request_state");
  return sql.raw(`
    CASE
      WHEN COALESCE(${t}.completed_at, excluded.completed_at) IS NOT NULL
      THEN 'COMPLETED'::${state}
      ELSE 'INITIATED'::${state}
    END
  `);
}
