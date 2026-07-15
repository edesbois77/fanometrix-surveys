-- Migration 078: Simulation — research_project_evidence provenance + attach trigger
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Phase 2 (3 of 6) of the Demo Projects blueprint. This is the single
-- database-level gate that makes "real projects reject simulated
-- evidence, simulated projects reject real evidence" true even against
-- a direct SQL statement — not just the API-level check that will be
-- added in front of it later.
--
-- research_project_evidence is polymorphic (evidence_type: survey |
-- social_search | document — document reserved, unimplemented). The
-- trigger checks three things must all agree on every insert/update:
--   1. the row's own is_simulated
--   2. the owning research_projects.research_mode
--   3. the referenced survey/social_search's own is_simulated
--     (looked up per evidence_type; 'document' has no source table
--      yet, so nothing to cross-check there beyond #1/#2)
--
-- No FK on evidence_id (unchanged from migration 069 — it's polymorphic
-- by convention, not a real foreign key), so this trigger is also the
-- only thing that will ever catch a dangling evidence_id.

ALTER TABLE research_project_evidence
  ADD COLUMN IF NOT EXISTS is_simulated boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION enforce_evidence_provenance_match()
RETURNS trigger AS $$
DECLARE
  project_mode           text;
  referenced_is_simulated boolean;
BEGIN
  SELECT research_mode INTO project_mode
    FROM research_projects WHERE id = NEW.research_project_id;

  IF project_mode IS NULL THEN
    RAISE EXCEPTION 'research_project_evidence.research_project_id % does not reference an existing research project', NEW.research_project_id;
  END IF;

  IF NEW.is_simulated <> (project_mode = 'simulated') THEN
    RAISE EXCEPTION 'Evidence is_simulated=% does not match research project % (research_mode=%)', NEW.is_simulated, NEW.research_project_id, project_mode;
  END IF;

  IF NEW.evidence_type = 'survey' THEN
    SELECT is_simulated INTO referenced_is_simulated FROM surveys WHERE id = NEW.evidence_id;
  ELSIF NEW.evidence_type = 'social_search' THEN
    SELECT is_simulated INTO referenced_is_simulated FROM social_searches WHERE id = NEW.evidence_id;
  ELSE
    -- 'document' evidence has no source table yet — nothing further to
    -- cross-check until that evidence type is implemented.
    referenced_is_simulated := NEW.is_simulated;
  END IF;

  IF referenced_is_simulated IS NULL THEN
    RAISE EXCEPTION 'research_project_evidence.evidence_id % (%) does not reference an existing %', NEW.evidence_id, NEW.evidence_type, NEW.evidence_type;
  END IF;

  IF referenced_is_simulated <> NEW.is_simulated THEN
    RAISE EXCEPTION 'Evidence % (%) is_simulated=% does not match research_project_evidence.is_simulated=%', NEW.evidence_id, NEW.evidence_type, referenced_is_simulated, NEW.is_simulated;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS research_project_evidence_provenance_match ON research_project_evidence;
CREATE TRIGGER research_project_evidence_provenance_match
  BEFORE INSERT OR UPDATE ON research_project_evidence
  FOR EACH ROW
  EXECUTE FUNCTION enforce_evidence_provenance_match();

-- Rollback:
--   DROP TRIGGER IF EXISTS research_project_evidence_provenance_match ON research_project_evidence;
--   DROP FUNCTION IF EXISTS enforce_evidence_provenance_match();
--   ALTER TABLE research_project_evidence DROP COLUMN IF EXISTS is_simulated;
