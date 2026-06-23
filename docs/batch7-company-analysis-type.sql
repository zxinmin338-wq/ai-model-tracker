-- Batch 7: allow analysis_type='company' in analysis_cache
-- The 厂商对比 page caches company-level AI analyses. The original CHECK only
-- permitted ('compare','weekly'); add 'company'. Run in Supabase SQL Editor.

ALTER TABLE analysis_cache DROP CONSTRAINT IF EXISTS analysis_cache_analysis_type_check;
ALTER TABLE analysis_cache
  ADD CONSTRAINT analysis_cache_analysis_type_check
  CHECK (analysis_type IN ('compare', 'weekly', 'company'));
