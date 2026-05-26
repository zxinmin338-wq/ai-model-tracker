-- ============================================================
-- AI Model Tracker — Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 模型清单
CREATE TABLE IF NOT EXISTS models (
  id BIGSERIAL PRIMARY KEY,
  permaslug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  brand TEXT NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '#888',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 调用量快照
CREATE TABLE IF NOT EXISTS snapshots (
  id BIGSERIAL PRIMARY KEY,
  model_id BIGINT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL,
  usage_date DATE NOT NULL,
  total_tokens BIGINT NOT NULL,
  total_requests BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_model_date ON snapshots(model_id, usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_captured ON snapshots(captured_at DESC);

-- 事件时间线
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  model_id BIGINT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'free_to_paid',
    'new_release',
    'price_change',
    'capacity_change',
    'custom'
  )),
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_model_date ON events(model_id, event_date);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);

-- ============================================================
-- RPC: 7-day ranking
-- ============================================================
CREATE OR REPLACE FUNCTION get_ranking_7d()
RETURNS TABLE (
  id BIGINT,
  permaslug TEXT,
  display_name TEXT,
  brand TEXT,
  color_hex TEXT,
  is_active BOOLEAN,
  tokens_7d BIGINT,
  requests_7d BIGINT
) LANGUAGE sql STABLE AS $$
  WITH latest_per_day AS (
    SELECT DISTINCT ON (model_id, usage_date)
      model_id, usage_date, total_tokens, total_requests
    FROM snapshots
    WHERE usage_date >= CURRENT_DATE - INTERVAL '7 days'
    ORDER BY model_id, usage_date, captured_at DESC
  )
  SELECT
    m.id,
    m.permaslug,
    m.display_name,
    m.brand,
    m.color_hex,
    m.is_active,
    COALESCE(SUM(l.total_tokens), 0)::BIGINT AS tokens_7d,
    COALESCE(SUM(l.total_requests), 0)::BIGINT AS requests_7d
  FROM models m
  LEFT JOIN latest_per_day l ON l.model_id = m.id
  WHERE m.is_active = true
  GROUP BY m.id
  ORDER BY tokens_7d DESC;
$$;

-- ============================================================
-- RPC: hourly deltas for peak/valley analysis
-- ============================================================
CREATE OR REPLACE FUNCTION get_hourly_deltas(p_model_id BIGINT)
RETURNS TABLE (
  hour_utc INT,
  avg_delta DOUBLE PRECISION
) LANGUAGE sql STABLE AS $$
  WITH hourly AS (
    SELECT
      DATE_TRUNC('hour', captured_at) AS hour,
      total_tokens,
      LAG(total_tokens) OVER (PARTITION BY usage_date ORDER BY captured_at) AS prev_tokens
    FROM snapshots
    WHERE model_id = p_model_id
      AND captured_at >= NOW() - INTERVAL '7 days'
  )
  SELECT
    EXTRACT(HOUR FROM hour)::INT AS hour_utc,
    AVG(total_tokens - prev_tokens)::DOUBLE PRECISION AS avg_delta
  FROM hourly
  WHERE prev_tokens IS NOT NULL
    AND total_tokens >= prev_tokens
  GROUP BY hour_utc
  ORDER BY avg_delta DESC;
$$;

-- ============================================================
-- Row Level Security — open read, restrict write
-- ============================================================
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "models_select" ON models FOR SELECT USING (true);
CREATE POLICY "snapshots_select" ON snapshots FOR SELECT USING (true);
CREATE POLICY "events_select" ON events FOR SELECT USING (true);

-- Allow service role to insert/update
CREATE POLICY "snapshots_insert_service" ON snapshots FOR INSERT
  WITH CHECK (true);
CREATE POLICY "models_insert_service" ON models FOR INSERT
  WITH CHECK (true);
CREATE POLICY "events_insert_service" ON events FOR INSERT
  WITH CHECK (true);
