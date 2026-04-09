BEGIN;

CREATE TEMP TABLE _ponder_params ON COMMIT DROP AS
SELECT EXTRACT(EPOCH FROM TIMESTAMPTZ '2026-03-01T00:00:00Z')::bigint AS cutoff_epoch;

-- First block at/after cutoff (per chain)
CREATE TEMP TABLE _ponder_cutoff_block ON COMMIT DROP AS
SELECT b.chain_id, MIN(b.number) AS cutoff_block
FROM ponder_sync.blocks b
CROSS JOIN _ponder_params p
WHERE b.timestamp >= p.cutoff_epoch
GROUP BY b.chain_id;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _ponder_cutoff_block) THEN
    RAISE EXCEPTION 'No blocks on/after cutoff — nothing to anchor ranges.';
  END IF;
END $$;

-- Earliest lower bound among interval subranges that CONTAIN the cutoff block; else cutoff_block
CREATE TEMP TABLE _ponder_purge_from ON COMMIT DROP AS
SELECT
  c.chain_id,
  COALESCE(
    (
      SELECT MIN(lower(r))
      FROM ponder_sync.intervals i
      CROSS JOIN LATERAL unnest(i.blocks) AS u(r)
      WHERE i.chain_id = c.chain_id
        AND r @> c.cutoff_block::numeric
    ),
    c.cutoff_block
  ) AS purge_from
FROM _ponder_cutoff_block c;

-- Raw sync tail (from purge_from)
DELETE FROM ponder_sync.logs l
USING _ponder_purge_from p
WHERE l.chain_id = p.chain_id AND l.block_number >= p.purge_from;

DELETE FROM ponder_sync.traces t
USING _ponder_purge_from p
WHERE t.chain_id = p.chain_id AND t.block_number >= p.purge_from;

DELETE FROM ponder_sync.transaction_receipts r
USING _ponder_purge_from p
WHERE r.chain_id = p.chain_id AND r.block_number >= p.purge_from;

DELETE FROM ponder_sync.transactions x
USING _ponder_purge_from p
WHERE x.chain_id = p.chain_id AND x.block_number >= p.purge_from;

DELETE FROM ponder_sync.blocks b
USING _ponder_purge_from p
WHERE b.chain_id = p.chain_id AND b.number >= p.purge_from;

-- Factory children first seen in the purged tail
DELETE FROM ponder_sync.factory_addresses fa
USING _ponder_purge_from p
WHERE fa.chain_id = p.chain_id AND fa.block_number >= p.purge_from;

-- RPC cache for the same tail (+ unscoped rows for those chains)
DELETE FROM ponder_sync.rpc_request_results rr
USING _ponder_purge_from p
WHERE rr.chain_id = p.chain_id
  AND (rr.block_number IS NULL OR rr.block_number >= p.purge_from);

-- Intervals: trim the tail from the multirange only — do NOT delete whole rows.
-- If you DELETE rows that overlap [purge_from, ∞), any single range [start, tip) is
-- removed entirely and Ponder loses completed coverage for [start, purge_from), so it
-- refetches from filter start (no cache). Subtracting preserves the prefix in `blocks`.
UPDATE ponder_sync.intervals i
SET blocks = i.blocks - nummultirange(
  numrange(p.purge_from::numeric, NULL::numeric, '[)')
)
FROM _ponder_purge_from p
WHERE i.chain_id = p.chain_id
  AND i.blocks && nummultirange(numrange(p.purge_from::numeric, NULL::numeric, '[)'));

DELETE FROM ponder_sync.intervals
WHERE blocks = '{}'::nummultirange;

COMMIT;