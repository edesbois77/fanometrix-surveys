-- Migration 089: Data fix — replace em-dashes with commas in existing
-- simulated survey/campaign/conversation-search names
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- create-simulated-project.ts previously named every generated survey/
-- campaign/search with an em-dash (e.g. "Carlsberg Euro 2028 — Simulated
-- Survey"). That code now uses a comma instead, but rows created before
-- this fix still carry the old em-dash names — this is a one-time
-- backfill so already-created Showroom demos show the corrected title
-- immediately rather than only new ones going forward. Scoped to
-- is_simulated = true and an exact suffix match, so it can't touch a
-- real (non-simulated) name that happens to contain an em-dash.

UPDATE surveys
SET name = REPLACE(name, ' — Simulated Survey', ', Simulated Survey')
WHERE is_simulated = true AND name LIKE '% — Simulated Survey';

UPDATE campaigns
SET campaign_name = REPLACE(campaign_name, ' — Simulated Deployment', ', Simulated Deployment')
WHERE is_simulated = true AND campaign_name LIKE '% — Simulated Deployment';

UPDATE social_searches
SET name = REPLACE(name, ' — Simulated Conversation Search', ', Simulated Conversation Search')
WHERE is_simulated = true AND name LIKE '% — Simulated Conversation Search';

-- Rollback: not meaningful (the previous em-dash text isn't recoverable
-- from the comma form alone) — re-run create-simulated-project.ts's old
-- template literal logic against affected rows if ever needed.
