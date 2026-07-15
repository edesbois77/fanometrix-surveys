-- Migration 084: Simulation — provenance-consistency triggers on campaigns, responses, social_mentions
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Phase 4 of the Demo Projects blueprint. The database-level half of
-- "simulated campaigns/searches only ever receive evidence from the
-- Simulation engine" — Phase 3 added the API-level check on
-- /api/submit, collect-reddit, and mentions/import; this is the
-- non-bypassable backstop underneath it, matching the same pattern
-- already used for research_project_evidence (migration 078).
--
-- Three triggers, not two. Reviewing this phase surfaced a gap one
-- level up: nothing enforced that campaigns.is_simulated agreed with
-- its own research_project_id's research_mode — migration 076's
-- constraint only checked that a simulated campaign HAS a
-- research_project_id, not that the project it points to is itself
-- simulated. Same class of hole migration 078 already closed for
-- research_project_evidence, extended here to campaigns:
--
--   - a campaign attached to a research project must always inherit
--     that project's research_mode
--   - if research_project_id IS NULL, existing (standalone real
--     campaign) behaviour is unchanged — the check is skipped entirely
--   - enforced by rejection, not silent coercion, matching every other
--     trigger in this migration series (075, 078, and the two below):
--     if application code ever sends a mismatched value, the insert
--     fails loudly rather than being silently corrected, which would
--     hide the bug that produced it. A rejected insert can't leave the
--     database in an inconsistent state either way — reject and
--     silently-derive both satisfy that — but only rejection surfaces
--     the mistake at its source.
--
-- The two triggers below on responses/social_mentions are deliberately
-- NOT symmetric with each other, and that's a correction to the
-- blueprint's original shorthand ("is_simulated must equal the
-- resolved campaign's/search's flag"), not an extension of it:
--
-- responses.is_demo is a different, older flag than
-- campaigns.is_simulated — it means "this is test data," and two
-- legitimate existing tools rely on setting is_demo = true against a
-- REAL campaign: app/embed-test/page.tsx's health check, and the
-- existing /api/demo/generate tool (kept working as-is — out of
-- scope for this work). A symmetric equality check would reject both.
-- The rule that's actually needed only constrains one direction: a
-- simulated campaign must never receive a row claiming to be a real
-- respondent (is_demo = false). A real campaign may still receive
-- either value, exactly as it does today.
--
-- social_mentions has no equivalent legacy case — the existing ad-hoc
-- "Generate Sample" QA tool writes to real searches via
-- import_source = 'synthetic', never touching is_simulated, so a full
-- symmetric equality check (mirroring migration 078's evidence
-- trigger) is safe here.
--
-- Both triggers resolve their parent by the same loose text-match
-- campaign_id/search_id already use elsewhere in the app (neither has
-- an FK) — if the parent doesn't resolve at all, the lookup returns
-- NULL and the check is skipped (Postgres treats a NULL condition in
-- IF as false), preserving the same "unresolvable parent" behavior
-- every other insert path already has at the database level; Phase 3
-- closed that gap specifically for /api/submit, not for every writer.

CREATE OR REPLACE FUNCTION enforce_campaign_project_provenance()
RETURNS trigger AS $$
DECLARE
  project_mode text;
BEGIN
  IF NEW.research_project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT research_mode INTO project_mode
    FROM research_projects WHERE id = NEW.research_project_id;

  -- research_project_id is a real foreign key (migration 043), so this
  -- branch is already unreachable in practice — Postgres would have
  -- rejected a dangling reference before this trigger ever ran. Kept
  -- as an explicit, readable guard rather than relying on that being
  -- true forever.
  IF project_mode IS NULL THEN
    RAISE EXCEPTION 'campaigns.research_project_id % does not reference an existing research project', NEW.research_project_id;
  END IF;

  IF NEW.is_simulated <> (project_mode = 'simulated') THEN
    RAISE EXCEPTION 'campaigns.is_simulated (%) does not match research project % (research_mode=%) — a campaign must inherit its project''s research_mode', NEW.is_simulated, NEW.research_project_id, project_mode;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS campaigns_project_provenance_match ON campaigns;
CREATE TRIGGER campaigns_project_provenance_match
  BEFORE INSERT OR UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION enforce_campaign_project_provenance();

CREATE OR REPLACE FUNCTION enforce_response_campaign_provenance()
RETURNS trigger AS $$
DECLARE
  campaign_is_simulated boolean;
BEGIN
  SELECT is_simulated INTO campaign_is_simulated
    FROM campaigns WHERE campaign_id = NEW.campaign_id;

  IF campaign_is_simulated = true AND NEW.is_demo = false THEN
    RAISE EXCEPTION 'responses.is_demo must be true for campaign % — it is simulated and cannot accept a row claiming to be a real respondent', NEW.campaign_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS responses_campaign_provenance_match ON responses;
CREATE TRIGGER responses_campaign_provenance_match
  BEFORE INSERT OR UPDATE ON responses
  FOR EACH ROW
  EXECUTE FUNCTION enforce_response_campaign_provenance();

CREATE OR REPLACE FUNCTION enforce_mention_search_provenance()
RETURNS trigger AS $$
DECLARE
  search_is_simulated boolean;
BEGIN
  SELECT is_simulated INTO search_is_simulated
    FROM social_searches WHERE id = NEW.search_id;

  IF search_is_simulated IS NOT NULL AND NEW.is_simulated <> search_is_simulated THEN
    RAISE EXCEPTION 'social_mentions.is_simulated (%) does not match search % (is_simulated=%)', NEW.is_simulated, NEW.search_id, search_is_simulated;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS social_mentions_search_provenance_match ON social_mentions;
CREATE TRIGGER social_mentions_search_provenance_match
  BEFORE INSERT OR UPDATE ON social_mentions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_mention_search_provenance();

-- Rollback:
--   DROP TRIGGER IF EXISTS social_mentions_search_provenance_match ON social_mentions;
--   DROP FUNCTION IF EXISTS enforce_mention_search_provenance();
--   DROP TRIGGER IF EXISTS responses_campaign_provenance_match ON responses;
--   DROP FUNCTION IF EXISTS enforce_response_campaign_provenance();
--   DROP TRIGGER IF EXISTS campaigns_project_provenance_match ON campaigns;
--   DROP FUNCTION IF EXISTS enforce_campaign_project_provenance();
