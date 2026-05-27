-- Batch 0: Update models table color_hex to Section 6.1 new palette
-- Run this in Supabase SQL editor

UPDATE models SET color_hex = '#5B8DEF' WHERE permaslug = 'baidu/cobuddy-20260430';
UPDATE models SET color_hex = '#9B7EDE' WHERE permaslug = 'inclusionai/ling-2.6-1t';
UPDATE models SET color_hex = '#E85B81' WHERE permaslug = 'inclusionai/ring-2.6-1t';
UPDATE models SET color_hex = '#F0A856' WHERE permaslug = 'minimax/m2.5';
UPDATE models SET color_hex = '#54B584' WHERE permaslug = 'qwen/qwen3-next-80b';
UPDATE models SET color_hex = '#5BB5C5' WHERE permaslug = 'z-ai/glm-4.5-air';
