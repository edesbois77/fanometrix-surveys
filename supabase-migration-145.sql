-- Migration 145: the Evidence Consumption Report on analysis_runs
--
-- A run already records coverage / unexamined / unmapped. What it could not
-- prove is exactly WHAT reached the reasoning engine: how many surveys,
-- documents, conversations and articles were consumed, how many observations
-- each contributed, and — the part that matters most for calibration — what was
-- excluded and why. gather.ts now builds that ledger before the LLM reasons over
-- anything, and the handler persists it here.
--
-- Nullable and additive: older runs simply carry NULL, and nothing reads it as
-- required. No backfill.

ALTER TABLE analysis_runs
  ADD COLUMN IF NOT EXISTS evidence_consumption jsonb;

COMMENT ON COLUMN analysis_runs.evidence_consumption IS
  'Evidence Consumption Report (lib/analysis/ledger.ts): per-source counts of what reached Analysis, observations supplied to reasoning, and every exclusion with its reason. Built by gather.ts before reasoning begins.';

NOTIFY pgrst, 'reload schema';

-- ── Rollback ──────────────────────────────────────────────────────────────────
--   ALTER TABLE analysis_runs DROP COLUMN IF EXISTS evidence_consumption;
