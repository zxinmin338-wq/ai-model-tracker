-- Batch 8: index to kill the breakdown RPC cold-start (~7s → sub-second)
-- Run in Supabase SQL Editor. CONCURRENTLY = no table lock (safe on live data).
--
-- Target query (get_ranking_breakdown_7d, docs/batch4):
--   SELECT DISTINCT ON (model_id, usage_date, is_free, source)
--          model_id, usage_date, is_free, source, total_tokens, total_requests
--   FROM snapshots
--   WHERE usage_date >= CURRENT_DATE - INTERVAL '14 days'
--   ORDER BY model_id, usage_date, is_free, source, captured_at DESC
--
-- Without an index Postgres does a full table scan of snapshots + a big sort to
-- satisfy the DISTINCT ON ordering — that's the ~7s cold cost.
--
-- This index's key columns match the DISTINCT ON / ORDER BY EXACTLY
-- (model_id, usage_date, is_free, source, captured_at DESC), so the planner can
-- read rows already in order — no sort, and it picks the first row per cell
-- directly. INCLUDE(total_tokens, total_requests) makes it a COVERING index, so
-- the scan is index-only (no heap fetches at all).
--
-- Bonus: the same index also serves get_model_platforms()
--   (SELECT DISTINCT model_id, source FROM snapshots) as an index-only scan,
-- since model_id + source are leading key columns.
--
-- Expected: breakdown cold-start ~7s → roughly 0.3–1s (index-only, no sort).
-- Low risk, fully reversible (DROP INDEX), no schema/data change.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_snapshots_breakdown
  ON snapshots (model_id, usage_date, is_free, source, captured_at DESC)
  INCLUDE (total_tokens, total_requests);

-- After it builds, confirm it's used (should show "Index Only Scan using
-- idx_snapshots_breakdown", no "Seq Scan", no big "Sort"):
--   EXPLAIN ANALYZE SELECT * FROM get_ranking_breakdown_7d();
--
-- To roll back if ever needed:
--   DROP INDEX CONCURRENTLY IF EXISTS idx_snapshots_breakdown;
