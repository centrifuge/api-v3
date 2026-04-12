BEGIN;
CREATE TEMP TABLE _ponder_params ON COMMIT DROP AS
SELECT EXTRACT(EPOCH FROM TIMESTAMPTZ '2026-03-30T00:00:00Z')::bigint AS cutoff_epoch;

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

CREATE TEMP TABLE _ponder_purge_from ON COMMIT DROP AS
SELECT c.chain_id, c.cutoff_block AS purge_from
FROM _ponder_cutoff_block c;

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

DELETE FROM ponder_sync.factory_addresses fa
USING _ponder_purge_from p
WHERE fa.chain_id = p.chain_id AND fa.block_number >= p.purge_from;

DELETE FROM ponder_sync.rpc_request_results rr
USING _ponder_purge_from p
WHERE rr.chain_id = p.chain_id
  AND (rr.block_number IS NULL OR rr.block_number >= p.purge_from);

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