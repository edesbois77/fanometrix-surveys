-- Migration 209: campaign_groups gains a Studio owner model
--
-- Status: HAND-APPLY. Additive — three columns, no legacy row changes meaning.
-- WP1 design refs: M1 · §3.1.
--
-- SHARED ROOT TABLE, DELIBERATELY
-- `campaign_groups` already holds legacy Research Project groups and will now
-- also hold Survey Studio groups, discriminated by `owner_model`. The legacy
-- MEMBERSHIP table `campaign_group_members` is NOT touched by WP1 at all —
-- Studio membership lives in its own revision tables.
--
-- Two existing routes read `select("*")` from this table and will see three
-- additional keys: app/api/campaign-groups/route.ts (list) and
-- app/api/campaign-groups/[id]/route.ts (detail). They are additive, so nothing
-- is lost; the release ships with a payload-shape test for each.
--
-- Defaulting is not sufficient on its own: every legacy query is also updated to
-- FILTER on owner_model, so a Studio group can never appear in a legacy list even
-- if this backfill is later disturbed by hand.

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.campaign_groups') IS NULL THEN
    RAISE EXCEPTION 'M209 PRE-FLIGHT FAILED: public.campaign_groups does not exist. Nothing changed.';
  END IF;
  RAISE NOTICE 'M209 pre-flight OK: % existing groups.', (SELECT count(*) FROM public.campaign_groups);
END
$preflight$;

ALTER TABLE public.campaign_groups
  ADD COLUMN IF NOT EXISTS organisation_id uuid,
  ADD COLUMN IF NOT EXISTS owner_model     text NOT NULL DEFAULT 'research_project',
  ADD COLUMN IF NOT EXISTS fail_mode       text NOT NULL DEFAULT 'open';

ALTER TABLE public.campaign_groups DROP CONSTRAINT IF EXISTS campaign_groups_owner_model_check;
ALTER TABLE public.campaign_groups ADD CONSTRAINT campaign_groups_owner_model_check
  CHECK (owner_model IN ('research_project','survey_studio'));

-- Legacy eligibility fails OPEN today (§1.5). That behaviour is preserved for
-- existing groups rather than silently changed, and 'open' is also the DEFAULT
-- for a new Studio group: the create API only sets 'closed' when an operator
-- deliberately asks for it. The new serve path enforces whichever is set —
-- 'open' returns 404 so the publisher's own fallback fills the slot, 'closed'
-- returns 409 rather than risk an unattributable impression.
ALTER TABLE public.campaign_groups DROP CONSTRAINT IF EXISTS campaign_groups_fail_mode_check;
ALTER TABLE public.campaign_groups ADD CONSTRAINT campaign_groups_fail_mode_check
  CHECK (fail_mode IN ('open','closed'));

-- A Studio group must be owned by an organisation; a legacy group must not gain one here.
ALTER TABLE public.campaign_groups DROP CONSTRAINT IF EXISTS campaign_groups_studio_requires_org;
ALTER TABLE public.campaign_groups ADD CONSTRAINT campaign_groups_studio_requires_org
  CHECK (owner_model <> 'survey_studio' OR organisation_id IS NOT NULL);

-- Referential integrity for the owning organisation.
--
-- ON DELETE SET NULL is NOT a preference — it is the convention this table
-- already keeps for every organisation reference it holds:
--   campaign_groups_publisher_org_id_fkey  ... ON DELETE SET NULL
--   campaign_groups_brand_org_id_fkey      ... ON DELETE SET NULL
--   campaign_groups_agency_org_id_fkey     ... ON DELETE SET NULL
-- (research_project_id is RESTRICT, but that is a different relationship: a
-- project OWNS its groups, an organisation is merely referenced by them.)
--
-- The column stays NULLABLE. Legacy groups have no owning organisation and must
-- not acquire one, and SET NULL cannot function against a NOT NULL column.
--
-- Interaction worth knowing, verified rather than assumed: deleting an
-- organisation that owns a STUDIO group sets organisation_id to NULL, which then
-- violates campaign_groups_studio_requires_org below, so the delete aborts. The
-- organisation is therefore protected either way; the error names the CHECK
-- rather than the foreign key. For LEGACY groups organisation_id is already NULL,
-- so SET NULL is a no-op and behaviour is identical to the three siblings.
ALTER TABLE public.campaign_groups DROP CONSTRAINT IF EXISTS campaign_groups_organisation_id_fkey;
ALTER TABLE public.campaign_groups ADD CONSTRAINT campaign_groups_organisation_id_fkey
  FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_groups_owner_model
  ON public.campaign_groups (owner_model);

DO $assert$
DECLARE v_fk text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.campaign_groups WHERE owner_model <> 'research_project') THEN
    RAISE EXCEPTION 'M209 FAILED: an existing group is not research_project after backfill';
  END IF;
  IF EXISTS (SELECT 1 FROM public.campaign_groups WHERE fail_mode <> 'open') THEN
    RAISE EXCEPTION 'M209 FAILED: an existing group changed fail_mode — legacy behaviour must be preserved';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_fk
    FROM pg_constraint WHERE conname = 'campaign_groups_organisation_id_fkey';
  IF v_fk IS NULL THEN
    RAISE EXCEPTION 'M209 FAILED: organisation_id foreign key missing';
  END IF;
  IF v_fk NOT LIKE '%ON DELETE SET NULL%' THEN
    RAISE EXCEPTION 'M209 FAILED: organisation_id FK is % (expected ON DELETE SET NULL, matching the sibling organisation FKs)', v_fk;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='campaign_groups'
                AND column_name='organisation_id' AND is_nullable='NO') THEN
    RAISE EXCEPTION 'M209 FAILED: organisation_id must stay NULLABLE for legacy groups and for ON DELETE SET NULL';
  END IF;
  RAISE NOTICE 'M209 OK: % legacy groups all owner_model=research_project, fail_mode=open (unchanged); organisation_id FK ON DELETE SET NULL.',
    (SELECT count(*) FROM public.campaign_groups);
END
$assert$;

COMMIT;
