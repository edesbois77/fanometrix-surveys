-- Migration 210: configuration revisions and their member snapshots
--
-- Status: HAND-APPLY. Additive — two new tables, nothing existing touched.
-- WP1 design refs: M3, M3a · §3.2, §3.5 · criteria 42-61.
--
-- THE MODEL
-- A revision is a COMPLETE, self-contained snapshot of a group's configuration at
-- one instant. Unchanged members are copied forward. That is what lets a revision
-- be independently immutable, and what lets "the configuration in force at time T"
-- be answered by one indexed lookup rather than an interval sweep.
--
-- `effective_at` is WHEN THE CONFIGURATION TAKES EFFECT; `created_at` is when the
-- edit was made. Scheduling writes a future-dated revision — there is no
-- scheduler, no cron and no activation mutation anywhere. The serve path simply
-- selects the latest revision whose effective_at has arrived.
--
-- NO target_id. Targets are deferred whole; the column and its real foreign key
-- arrive with the target subsystem, not as a placeholder here.

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.campaign_groups') IS NULL THEN
    RAISE EXCEPTION 'M210 PRE-FLIGHT FAILED: public.campaign_groups missing. Nothing changed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='campaign_groups' AND column_name='owner_model') THEN
    RAISE EXCEPTION 'M210 PRE-FLIGHT FAILED: migration 209 has not been applied. Nothing changed.';
  END IF;
  RAISE NOTICE 'M210 pre-flight OK.';
END
$preflight$;

CREATE TABLE IF NOT EXISTS public.campaign_group_revisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              uuid NOT NULL REFERENCES public.campaign_groups(id) ON DELETE CASCADE,
  -- When this configuration takes effect. Past or now = live; future = scheduled.
  effective_at          timestamptz NOT NULL,
  rotation              text NOT NULL,
  -- Concurrently-active member cap for THIS revision. Configuration, not schema,
  -- so it changes without a migration (criterion 43).
  active_member_limit   integer NOT NULL DEFAULT 20,
  -- The revision this one was derived from, so a pending revision's delta is
  -- computable without storing a separate intent record (criterion 56e).
  based_on_revision_id  uuid REFERENCES public.campaign_group_revisions(id) ON DELETE SET NULL,
  change_kind           text NOT NULL,
  change_reason         text,
  comparability_ack     boolean NOT NULL DEFAULT false,
  created_by            text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  cancelled_at          timestamptz,
  cancelled_by          text,
  CONSTRAINT cgr_rotation_check    CHECK (rotation IN ('equal','weighted','priority')),
  CONSTRAINT cgr_change_kind_check CHECK (change_kind IN
    ('created','members_added','members_removed','member_paused','member_resumed',
     'weights_changed','priority_changed','rotation_changed','limit_changed')),
  CONSTRAINT cgr_limit_positive    CHECK (active_member_limit > 0),
  CONSTRAINT cgr_cancelled_pair    CHECK ((cancelled_at IS NULL) = (cancelled_by IS NULL))
);

-- Two NON-CANCELLED revisions can never share an effective_at for one group
-- (criterion 58). Cancelled ones are retained, so the index must be partial.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cgr_group_effective_active
  ON public.campaign_group_revisions (group_id, effective_at)
  WHERE cancelled_at IS NULL;

-- THE SERVE INDEX. The current-revision lookup runs on every impression; without
-- this it is a sequential scan per serve. Ordering ties break deterministically
-- on (effective_at, created_at, id).
CREATE INDEX IF NOT EXISTS idx_cgr_group_effective_desc
  ON public.campaign_group_revisions (group_id, effective_at DESC, created_at DESC, id DESC)
  WHERE cancelled_at IS NULL;

CREATE TABLE IF NOT EXISTS public.campaign_group_revision_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id      uuid NOT NULL REFERENCES public.campaign_group_revisions(id) ON DELETE CASCADE,
  -- The IMMUTABLE database id, never the slug (§3.9, criterion 63).
  campaign_id      uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  weight           integer NOT NULL DEFAULT 1,
  priority         integer NOT NULL DEFAULT 100,
  membership_state text    NOT NULL DEFAULT 'active',
  CONSTRAINT cgrm_state_check   CHECK (membership_state IN ('active','paused')),
  -- Weight is a positive share. Removing a member from rotation is done by
  -- PAUSING it, not by weighting it to zero — a zero-weight member would be
  -- indistinguishable from a configuration mistake.
  CONSTRAINT cgrm_weight_positive   CHECK (weight > 0),
  CONSTRAINT cgrm_priority_positive CHECK (priority > 0),
  CONSTRAINT cgrm_unique_per_revision UNIQUE (revision_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_cgrm_revision ON public.campaign_group_revision_members (revision_id);
CREATE INDEX IF NOT EXISTS idx_cgrm_campaign ON public.campaign_group_revision_members (campaign_id);

-- ── Security contract (§4) ───────────────────────────────────────────────────
ALTER TABLE public.campaign_group_revisions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_group_revision_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_anon ON public.campaign_group_revisions;
CREATE POLICY deny_all_anon ON public.campaign_group_revisions FOR ALL TO public USING (false);
DROP POLICY IF EXISTS deny_all_anon ON public.campaign_group_revision_members;
CREATE POLICY deny_all_anon ON public.campaign_group_revision_members FOR ALL TO public USING (false);

REVOKE ALL ON public.campaign_group_revisions        FROM anon, authenticated;
REVOKE ALL ON public.campaign_group_revision_members FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_group_revisions        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_group_revision_members TO service_role;

DO $assert$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['campaign_group_revisions','campaign_group_revision_members'] LOOP
    IF to_regclass('public.'||t) IS NULL THEN
      RAISE EXCEPTION 'M210 FAILED: % not created', t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.'||t)::regclass) THEN
      RAISE EXCEPTION 'M210 FAILED: RLS not enabled on %', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t
                     AND policyname='deny_all_anon' AND cmd='ALL' AND qual='false') THEN
      RAISE EXCEPTION 'M210 FAILED: deny_all_anon missing or not denying on %', t;
    END IF;
    IF has_table_privilege('anon','public.'||t,'SELECT')
       OR has_table_privilege('authenticated','public.'||t,'SELECT') THEN
      RAISE EXCEPTION 'M210 FAILED: anon or authenticated can reach %', t;
    END IF;
    IF NOT has_table_privilege('service_role','public.'||t,'SELECT') THEN
      RAISE EXCEPTION 'M210 FAILED: service_role cannot read % — the API could not function', t;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_cgr_group_effective_desc') THEN
    RAISE EXCEPTION 'M210 FAILED: the serve index is missing — the current-revision lookup would seq-scan per impression';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_cgr_group_effective_active') THEN
    RAISE EXCEPTION 'M210 FAILED: partial unique on (group_id, effective_at) missing';
  END IF;
  RAISE NOTICE 'M210 OK: both tables created, RLS deny-all, service_role only, serve index present.';
END
$assert$;

COMMIT;
