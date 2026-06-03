-- Batch 4: Per-(model, source, channel) 7d/prev-7d breakdown for homepage filters
-- Run this in Supabase SQL Editor
--
-- The homepage ranking gains two filters (platform = source, channel = is_free).
-- When a filter is active the displayed token total must be re-scoped to only the
-- selected platform/channel — get_ranking_7d only returns the cross-source/channel
-- sum, so this companion RPC exposes the same dedup'd cells split by source+is_free.
--
-- Dedup key matches get_ranking_7d exactly: latest captured_at per
-- (model_id, usage_date, is_free, source). Then summed into current-7d / prev-7d.
-- Summing every returned row of a model == that model's get_ranking_7d total, so
-- the "all/all" homepage view is unchanged.

CREATE OR REPLACE FUNCTION get_ranking_breakdown_7d()
RETURNS TABLE (
  model_id BIGINT,
  source TEXT,
  is_free BOOLEAN,
  tokens_7d BIGINT,
  tokens_prev_7d BIGINT,
  requests_7d BIGINT
) LANGUAGE sql STABLE AS $$
  WITH latest_per_cell AS (
    SELECT DISTINCT ON (model_id, usage_date, is_free, source)
      model_id, usage_date, is_free, source, total_tokens, total_requests
    FROM snapshots
    WHERE usage_date >= CURRENT_DATE - INTERVAL '14 days'
    ORDER BY model_id, usage_date, is_free, source, captured_at DESC
  )
  SELECT
    model_id,
    source,
    is_free,
    COALESCE(SUM(total_tokens) FILTER (
      WHERE usage_date >= CURRENT_DATE - INTERVAL '7 days'
    ), 0)::BIGINT AS tokens_7d,
    COALESCE(SUM(total_tokens) FILTER (
      WHERE usage_date >= CURRENT_DATE - INTERVAL '14 days'
        AND usage_date < CURRENT_DATE - INTERVAL '7 days'
    ), 0)::BIGINT AS tokens_prev_7d,
    -- total_requests may be NULL (zenmux); SUM ignores NULLs.
    COALESCE(SUM(total_requests) FILTER (
      WHERE usage_date >= CURRENT_DATE - INTERVAL '7 days'
    ), 0)::BIGINT AS requests_7d
  FROM latest_per_cell
  GROUP BY model_id, source, is_free;
$$;
