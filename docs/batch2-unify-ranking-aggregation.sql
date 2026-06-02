-- Batch 2: Unify homepage ranking aggregation with compare/detail pages
-- Run this in Supabase SQL Editor
--
-- Problem: get_ranking_7d deduped by (model_id, usage_date, is_free) — it summed
-- free+standard channels but NOT across sources. A multi-source model (ernie-5.1
-- with anyint + zenmux, both is_free=false) collapsed to one source per day with a
-- non-deterministic tie on overlapping captured_at, so the homepage disagreed with
-- the compare/detail pages (which dedup by (model_id, usage_date, is_free, source)
-- then SUM).
--
-- Fix: match the compare/detail key exactly —
--   1. take the latest captured_at per (model_id, usage_date, is_free, source) cell
--   2. SUM all cells of a (model_id, usage_date) into that day's total
--   3. aggregate per 7d / prev-7d window
-- This is the SPEC "all channels/platforms combined" main metric.
--
-- Return signature: all `models` columns + 4 usage metrics, matching what the
-- frontend (home-client / model-table) reads (released_at, region, current_status…).

CREATE OR REPLACE FUNCTION get_ranking_7d()
RETURNS TABLE (
  id BIGINT,
  permaslug TEXT,
  display_name TEXT,
  brand TEXT,
  color_hex TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  monitored_since TIMESTAMPTZ,
  current_status TEXT,
  region TEXT,
  is_own BOOLEAN,
  provider TEXT,
  released_at DATE,
  tokens_7d BIGINT,
  requests_7d BIGINT,
  tokens_prev_7d BIGINT,
  requests_prev_7d BIGINT
) LANGUAGE sql STABLE AS $$
  WITH latest_per_cell AS (
    -- One row per (model, day, channel, source): the freshest capture of that cell.
    SELECT DISTINCT ON (model_id, usage_date, is_free, source)
      model_id, usage_date, is_free, source, total_tokens, total_requests
    FROM snapshots
    WHERE usage_date >= CURRENT_DATE - INTERVAL '14 days'
    ORDER BY model_id, usage_date, is_free, source, captured_at DESC
  ),
  per_day AS (
    -- Sum every channel + every source into the model's daily total.
    -- total_requests may be NULL (e.g. zenmux); SUM ignores NULLs.
    SELECT
      model_id,
      usage_date,
      SUM(total_tokens)::BIGINT AS total_tokens,
      SUM(total_requests)::BIGINT AS total_requests
    FROM latest_per_cell
    GROUP BY model_id, usage_date
  ),
  current_week AS (
    SELECT model_id,
      COALESCE(SUM(total_tokens), 0)::BIGINT AS tokens_7d,
      COALESCE(SUM(total_requests), 0)::BIGINT AS requests_7d
    FROM per_day
    WHERE usage_date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY model_id
  ),
  prev_week AS (
    SELECT model_id,
      COALESCE(SUM(total_tokens), 0)::BIGINT AS tokens_prev_7d,
      COALESCE(SUM(total_requests), 0)::BIGINT AS requests_prev_7d
    FROM per_day
    WHERE usage_date >= CURRENT_DATE - INTERVAL '14 days'
      AND usage_date < CURRENT_DATE - INTERVAL '7 days'
    GROUP BY model_id
  )
  SELECT
    m.id,
    m.permaslug,
    m.display_name,
    m.brand,
    m.color_hex,
    m.is_active,
    m.created_at,
    m.monitored_since,
    m.current_status,
    m.region,
    m.is_own,
    m.provider,
    m.released_at,
    COALESCE(c.tokens_7d, 0)::BIGINT AS tokens_7d,
    COALESCE(c.requests_7d, 0)::BIGINT AS requests_7d,
    COALESCE(p.tokens_prev_7d, 0)::BIGINT AS tokens_prev_7d,
    COALESCE(p.requests_prev_7d, 0)::BIGINT AS requests_prev_7d
  FROM models m
  LEFT JOIN current_week c ON c.model_id = m.id
  LEFT JOIN prev_week p ON p.model_id = m.id
  WHERE m.is_active = true
  ORDER BY tokens_7d DESC;
$$;
