-- Migration 207: campaign preview grants (secure ad-ops review links)
--
-- Status: HAND-APPLY. Do NOT auto-apply. Additive: one new table, no change to
--         any existing table, column, policy or function.
--
-- WHY
-- The Deploy page offers a preview link "shareable with ad-ops". It pointed at
-- surveys.fanometrix.com with ?preview=1 — cross-origin from app.fanometrix.com,
-- so the session cookie (SameSite=Lax) is never sent. Once ?preview=1 required a
-- session, the inline iframe went blank and the shared link stopped rendering.
--
-- Restoring unrestricted ?preview=1 is not an option: it would re-open draft
-- research instruments to anyone holding a campaign slug. A reviewer without a
-- Fanometrix account needs an explicit, scoped, revocable credential instead.
--
-- DESIGN
--   • Opaque high-entropy token (32 random bytes, base64url). Only its SHA-256
--     is stored, so a database read cannot reproduce a working link. Chosen over
--     a signed token so grants can be revoked individually and immediately.
--   • Scoped to exactly ONE campaign, with the survey and organisation frozen at
--     creation and re-resolved server-side on every use. Nothing about identity
--     is ever taken from the request alongside the token.
--   • Explicit expiry, explicit revocation, regenerable.
--   • A valid grant may bypass campaign LIVE-STATUS validation (the point of
--     review) but never ownership binding, deletion status, or survey-integrity
--     validation. Those are enforced in the route, not here.
--
-- RLS follows the deny_all_anon pattern used by response_answers and
-- submission_logs: the table is reachable only by the service role. Anonymous
-- reviewers never touch it directly — the embed route resolves on their behalf.

BEGIN;

CREATE TABLE IF NOT EXISTS public.campaign_preview_grants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  -- Frozen at creation so a later survey re-point cannot silently widen a live
  -- grant to different content. Re-checked against the campaign on every use.
  survey_id        uuid,
  organisation_id  uuid,
  -- SHA-256 (hex) of the opaque token. The token itself is returned ONCE, at
  -- creation, and is never stored or logged.
  token_hash       text NOT NULL UNIQUE,
  created_by       text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  revoked_at       timestamptz,
  last_used_at     timestamptz,
  use_count        integer NOT NULL DEFAULT 0,
  CONSTRAINT campaign_preview_grants_expiry_after_creation CHECK (expires_at > created_at)
);

-- Lookup is by token hash on every preview request.
CREATE INDEX IF NOT EXISTS idx_campaign_preview_grants_token_hash
  ON public.campaign_preview_grants (token_hash);
-- "Show me the current grant for this campaign" on the Deploy page.
CREATE INDEX IF NOT EXISTS idx_campaign_preview_grants_campaign
  ON public.campaign_preview_grants (campaign_id, created_at DESC);

ALTER TABLE public.campaign_preview_grants ENABLE ROW LEVEL SECURITY;

-- Service role only. `cmd = ALL` with USING(false) and no WITH CHECK denies every
-- command, matching response_answers / submission_logs.
DROP POLICY IF EXISTS deny_all_anon ON public.campaign_preview_grants;
CREATE POLICY deny_all_anon ON public.campaign_preview_grants FOR ALL TO public USING (false);

REVOKE ALL ON public.campaign_preview_grants FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_preview_grants TO service_role;

COMMIT;
