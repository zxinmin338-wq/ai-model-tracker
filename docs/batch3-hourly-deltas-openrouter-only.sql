-- Batch 3: Restrict get_hourly_deltas to OpenRouter (true hourly/cumulative) data
-- Run this in Supabase SQL Editor
--
-- Problem: get_hourly_deltas computes per-(usage_date) LAG deltas of total_tokens
-- ordered by captured_at, assuming total_tokens is an intra-day CUMULATIVE counter
-- (only true for OpenRouter, which snapshots many times/day). For daily-grain
-- sources (anyint, zenmux) each fetch RE-INSERTS the day's total at a new
-- captured_at; mixing a tiny anyint value and a huge zenmux value in the same
-- partition produces spurious positive "deltas" bucketed by the cron's run hour —
-- pure noise (e.g. ernie-5.1 showed a fake ~19M tokens/hr peak at 09-12 UTC).
--
-- Fix: only consider source='openrouter' rows. OpenRouter is the only source with
-- real hourly/cumulative snapshots. Models without any OpenRouter data return no
-- rows (the detail page hides the block). Models that are OpenRouter-only (e.g. GLM)
-- are unaffected — the filter removes nothing, so their numbers are unchanged.
--
-- DROP first: the live function's return signature may differ from this file's,
-- and CREATE OR REPLACE cannot change return types. Drop BOTH possible param-type
-- overloads (the live one was declared with `integer`, not `bigint`) to avoid
-- PostgREST "could not choose the best candidate function" ambiguity.

DROP FUNCTION IF EXISTS get_hourly_deltas(integer);
DROP FUNCTION IF EXISTS get_hourly_deltas(bigint);

CREATE FUNCTION get_hourly_deltas(p_model_id BIGINT)
RETURNS TABLE (
  hour_utc INT,
  avg_delta DOUBLE PRECISION,
  sample_count BIGINT
) LANGUAGE sql STABLE AS $$
  WITH hourly AS (
    SELECT
      DATE_TRUNC('hour', captured_at) AS hour,
      total_tokens,
      LAG(total_tokens) OVER (PARTITION BY usage_date ORDER BY captured_at) AS prev_tokens
    FROM snapshots
    WHERE model_id = p_model_id
      AND source = 'openrouter'  -- only OpenRouter has real hourly/cumulative data
      AND captured_at >= NOW() - INTERVAL '7 days'
  )
  SELECT
    EXTRACT(HOUR FROM hour)::INT AS hour_utc,
    AVG(total_tokens - prev_tokens)::DOUBLE PRECISION AS avg_delta,
    COUNT(*)::BIGINT AS sample_count
  FROM hourly
  WHERE prev_tokens IS NOT NULL
    AND total_tokens >= prev_tokens
  GROUP BY hour_utc
  ORDER BY avg_delta DESC;
$$;
