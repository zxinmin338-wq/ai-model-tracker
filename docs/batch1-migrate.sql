-- Batch 1: ALTER models table + update RPC
-- Run this in Supabase SQL Editor
--
-- ⚠️ STALE / DO NOT RE-RUN AS-IS ⚠️
-- This file does NOT reflect the live schema/RPC. Key drifts:
--   * It adds/uses a `discovered_at` column that does NOT exist in the live
--     `models` table — the live table uses `released_at` + `monitored_since`.
--   * Its `get_ranking_7d` definition is OUTDATED. The live function was later
--     changed to dedup by (model_id, usage_date, is_free, source) and SUM all
--     channels+sources per day.
-- ➜ The authoritative get_ranking_7d definition now lives in:
--     docs/batch2-unify-ranking-aggregation.sql
-- Kept here only as a historical record of what was attempted.

-- 1. Add new columns to models
ALTER TABLE models ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE models ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'free' CHECK (current_status IN ('free', 'paid', 'transitioning', 'deprecated'));
ALTER TABLE models ADD COLUMN IF NOT EXISTS region TEXT;

-- 2. Seed current_status + region for existing models
UPDATE models SET current_status = 'free', region = 'china' WHERE permaslug = 'baidu/cobuddy-20260430';
UPDATE models SET current_status = 'paid', region = 'china' WHERE permaslug = 'inclusionai/ling-2.6-1t';
UPDATE models SET current_status = 'paid', region = 'china' WHERE permaslug = 'inclusionai/ring-2.6-1t';
UPDATE models SET current_status = 'free', region = 'china' WHERE permaslug = 'minimax/m2.5';
UPDATE models SET current_status = 'free', region = 'china' WHERE permaslug = 'qwen/qwen3-next-80b';
UPDATE models SET current_status = 'free', region = 'china' WHERE permaslug = 'z-ai/glm-4.5-air';

-- 3. Update get_ranking_7d to include new columns + growth %
CREATE OR REPLACE FUNCTION get_ranking_7d()
RETURNS TABLE (
  id BIGINT,
  permaslug TEXT,
  display_name TEXT,
  brand TEXT,
  color_hex TEXT,
  is_active BOOLEAN,
  current_status TEXT,
  region TEXT,
  discovered_at TIMESTAMPTZ,
  tokens_7d BIGINT,
  requests_7d BIGINT,
  tokens_prev_7d BIGINT,
  requests_prev_7d BIGINT
) LANGUAGE sql STABLE AS $$
  WITH latest_per_day AS (
    SELECT DISTINCT ON (model_id, usage_date)
      model_id, usage_date, total_tokens, total_requests
    FROM snapshots
    WHERE usage_date >= CURRENT_DATE - INTERVAL '14 days'
    ORDER BY model_id, usage_date, captured_at DESC
  ),
  current_week AS (
    SELECT model_id,
      COALESCE(SUM(total_tokens), 0)::BIGINT AS tokens_7d,
      COALESCE(SUM(total_requests), 0)::BIGINT AS requests_7d
    FROM latest_per_day
    WHERE usage_date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY model_id
  ),
  prev_week AS (
    SELECT model_id,
      COALESCE(SUM(total_tokens), 0)::BIGINT AS tokens_prev_7d,
      COALESCE(SUM(total_requests), 0)::BIGINT AS requests_prev_7d
    FROM latest_per_day
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
    m.current_status,
    m.region,
    m.discovered_at,
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

-- 4. RLS policies for update (events management will need this)
CREATE POLICY "events_update_service" ON events FOR UPDATE USING (true);
CREATE POLICY "events_delete_service" ON events FOR DELETE USING (true);
CREATE POLICY "models_update_service" ON models FOR UPDATE USING (true);
