-- Migration 164: seed the Fanometrix Stack design's DEFAULT Topic.
--
-- Data-only: creative_designs.config (jsonb) already exists from migration 163,
-- so there is NO schema change. Sets config.defaultTopic = "Women's Football" on
-- the seeded system Stack design, which the Intro shows by default. A survey/
-- campaign may override or clear it via campaigns.topic (null = inherit default,
-- '' = explicitly cleared → no Topic, text = override).
--
-- Idempotent: only sets defaultTopic when it isn't already present, so it never
-- overwrites a value edited later. Touches only the system Stack design row.

UPDATE creative_designs
SET config = coalesce(config, '{}'::jsonb) || jsonb_build_object('defaultTopic', 'Women''s Football')
WHERE slug = 'fanometrix-stack'
  AND coalesce(config ->> 'defaultTopic', '') = '';
