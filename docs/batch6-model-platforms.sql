-- Batch 6: get_model_platforms() — collapse the per-model N+1 into one query
-- Run this in Supabase SQL Editor.
--
-- Why: getModelPlatforms() previously fired one snapshots query PER model
-- (~220 sequential round-trips) → the /compare page blocked 5-10s server-side.
-- This RPC returns DISTINCT (model_id, source) in a single round-trip; the app
-- builds the model→platforms map from it. Same semantics (all-time distinct
-- sources, all models). Until this exists the app falls back to the old slow
-- per-model query (correct but slow).

CREATE OR REPLACE FUNCTION get_model_platforms()
RETURNS TABLE (model_id BIGINT, source TEXT)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT model_id, source
  FROM snapshots;
$$;
