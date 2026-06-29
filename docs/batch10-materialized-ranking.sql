-- Batch 10: materialized views for the homepage ranking + breakdown
-- Run in Supabase SQL Editor (as ONE block is fine; no CONCURRENTLY here).
--
-- Why: on Supabase free tier, get_ranking_7d() is heavy (DISTINCT ON over ~200k
-- snapshot rows) and its buffers cool within ~1-2 min, so a cold call hits the
-- statement timeout (~14s) and returns nothing. A 5-min keep-warm cron can't win
-- that race, so the homepage's first visitor kept seeing a slow/empty board.
--
-- Fix: precompute the result into a tiny materialized view (~200 rows). Reads are
-- instant, never time out, and always return the LAST GOOD snapshot — even if a
-- later refresh fails while cold, the view keeps serving the previous good data,
-- so the board is NEVER empty. The view is refreshed every few minutes by the
-- keep-warm cron (which warms the RPC first, so the refresh completes).
--
-- ⚠️ If CREATE MATERIALIZED VIEW times out (cold get_ranking_7d), just run this
-- block again — the first (failed) attempt warms the buffers, the second succeeds.

CREATE MATERIALIZED VIEW IF NOT EXISTS ranking_7d_mv AS
  SELECT * FROM get_ranking_7d();

CREATE MATERIALIZED VIEW IF NOT EXISTS ranking_breakdown_7d_mv AS
  SELECT * FROM get_ranking_breakdown_7d();

-- One RPC the app/cron can call to refresh both. Non-concurrent REFRESH (brief
-- lock, fine for low traffic) so it can run inside this function's transaction.
-- SET LOCAL raises the timeout for THIS refresh only, so the heavy underlying
-- query completes even when cold (the API's default ~8s timeout would kill it).
CREATE OR REPLACE FUNCTION refresh_ranking_caches()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  SET LOCAL statement_timeout = '90s';
  REFRESH MATERIALIZED VIEW ranking_7d_mv;
  REFRESH MATERIALIZED VIEW ranking_breakdown_7d_mv;
END $$;

-- Let the API roles read the views and call the refresh.
GRANT SELECT ON ranking_7d_mv TO anon, authenticated, service_role;
GRANT SELECT ON ranking_breakdown_7d_mv TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_ranking_caches() TO anon, authenticated, service_role;

-- Sanity check (should return ~200 rows instantly):
--   SELECT count(*) FROM ranking_7d_mv;
--   SELECT display_name, tokens_7d FROM ranking_7d_mv ORDER BY tokens_7d DESC LIMIT 3;
