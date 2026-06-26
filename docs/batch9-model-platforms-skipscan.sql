-- Batch 9: get_model_platforms() — full-table DISTINCT → loose index (skip) scan
-- Run in Supabase SQL Editor.
--
-- Problem: get_model_platforms() does `SELECT DISTINCT model_id, source FROM
-- snapshots` with NO date filter, so it scans all ~1.77M rows every call (~4-5s,
-- even warm). The batch8 index doesn't help — `source` is its 4th key column,
-- not adjacent to model_id, so it can't satisfy DISTINCT (model_id, source)
-- cheaply. This RPC is the homepage's slowest blocker (Promise.all waits on it).
--
-- Fix: there are only ~192 distinct (model_id, source) pairs. Instead of reading
-- 1.77M rows, emulate Postgres's missing "loose index scan": a recursive skip
-- scan that jumps to the NEXT distinct pair via the index. With a (model_id,
-- source) index that's ~192 index seeks total → milliseconds, not seconds.
--
-- Output is byte-for-byte identical to the old function (same 192 rows, same
-- column names/types). No data / is_own / tagging change — pure read-path perf.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ RUN THE TWO STATEMENTS SEPARATELY.
-- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, so run it
-- on its own first; then run the CREATE OR REPLACE FUNCTION.
-- ─────────────────────────────────────────────────────────────────────────────

-- STEP 1 — narrow index the skip scan rides on (no lock, reversible, ~small).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_snapshots_model_source
  ON snapshots (model_id, source);

-- STEP 2 — replace the function with the skip-scan version (same signature).
CREATE OR REPLACE FUNCTION get_model_platforms()
RETURNS TABLE (model_id BIGINT, source TEXT)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE skip AS (
    -- Seed: the smallest (model_id, source) pair in the index.
    (
      SELECT s.model_id, s.source
      FROM snapshots s
      ORDER BY s.model_id, s.source
      LIMIT 1
    )
    UNION ALL
    -- Step: from the current pair, jump to the next strictly-greater pair.
    -- Row-wise comparison (model_id, source) > (cur...) becomes an index range
    -- scan + LIMIT 1, i.e. a single seek per distinct pair (~192 total).
    SELECT nxt.model_id, nxt.source
    FROM skip cur
    CROSS JOIN LATERAL (
      SELECT s.model_id, s.source
      FROM snapshots s
      WHERE (s.model_id, s.source) > (cur.model_id, cur.source)
      ORDER BY s.model_id, s.source
      LIMIT 1
    ) nxt
  )
  SELECT model_id, source FROM skip;
$$;

-- Verify (should show recursive skip scan + Index Only Scan on
-- idx_snapshots_model_source, NOT a Seq Scan over 1.77M rows; Execution Time
-- should be a few ms):
--   EXPLAIN ANALYZE SELECT * FROM get_model_platforms();
--
-- Rollback if ever needed:
--   CREATE OR REPLACE FUNCTION get_model_platforms()
--   RETURNS TABLE (model_id BIGINT, source TEXT) LANGUAGE sql STABLE AS $$
--     SELECT DISTINCT model_id, source FROM snapshots;
--   $$;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_snapshots_model_source;
--
-- Note on NULLs: snapshots.source is non-null (default 'openrouter', backfilled),
-- so the skip scan covers every pair the old DISTINCT returned.
