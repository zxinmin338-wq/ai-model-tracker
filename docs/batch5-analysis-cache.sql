-- Batch 5: analysis_cache table for LLM-generated market analysis
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS analysis_cache (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,          -- hash(sorted permaslugs + date + type)
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('compare', 'weekly')),
  content TEXT NOT NULL,                    -- LLM output text
  model_data_snapshot JSONB,               -- structured input fed to the LLM (traceability)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_key ON analysis_cache(cache_key);

ALTER TABLE analysis_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analysis_cache_select" ON analysis_cache FOR SELECT USING (true);
CREATE POLICY "analysis_cache_insert" ON analysis_cache FOR INSERT WITH CHECK (true);
