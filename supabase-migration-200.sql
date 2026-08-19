-- Migration 200: Research Reasoner — verified research intelligence runs.
--
-- Domain table for the gated Research Reasoning layer. Records ONE model-powered,
-- verifier-checked research interpretation produced ASYNCHRONOUSLY alongside an
-- authoritative Survey Studio analysis run. The deterministic Analytical Core remains
-- the factual authority and the safe fallback; this layer is analytical intelligence,
-- constrained by the verifier, surfaced only behind a flag (RESEARCH_REASONER_ENABLED)
-- / to admins. Failure or absence of a row changes nothing: Findings falls back to the
-- existing deterministic experience.
--
-- Two-layer discipline (jobs framework): the `jobs` row is the OPERATIONAL record of the
-- async attempt; THIS table is the BUSINESS record of what the reasoner produced for a
-- run. Each row links to the AUTHORITATIVE run whose IMMUTABLE evidence_snapshot was
-- reasoned over (survey_analysis_runs.id) — the key that ties intelligence to the exact
-- governed evidence and prevents a new analysis run from ever displaying intelligence
-- generated from an older snapshot. Kind-scoped, NOT an FK (no write-path dependency on
-- an authoritative table), mirroring analytical_core_shadow_runs (migration 199).
--
-- PRIVACY: stores only product/audit-safe artefacts — the VERIFIED, shaped product
-- intelligence and the per-claim verification result. NO model chain-of-thought is
-- requested or stored (the API returns only the final structured answer).
--
-- SAFETY: additive, non-destructive, idempotent. NOT auto-applied — hand-applied per the
-- DB-ahead-of-code practice, initially only in a CONTROLLED (non-production) database.
-- The layer stays flag-OFF in production regardless.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS research_reasoner_runs;

CREATE TABLE IF NOT EXISTS research_reasoner_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind         text NOT NULL CHECK (source_kind IN ('survey')),
  source_id           uuid NOT NULL,                       -- survey_id (convenience for reads)
  -- The AUTHORITATIVE run whose immutable evidence_snapshot was reasoned over
  -- (survey_analysis_runs.id). Kind-scoped, not an FK.
  analysis_run_id     uuid NOT NULL,
  evidence_fingerprint text,                               -- the run's evidence_hash (stale-detection)
  versions            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { reasoner, schema, prompt }
  model               text,                                -- e.g. 'o3'
  displayable         boolean NOT NULL DEFAULT false,      -- false ⇒ product must fall back to deterministic
  status              text NOT NULL CHECK (status IN ('completed','failed','skipped')),
  product             jsonb,                               -- VERIFIED, shaped ProductIntelligence (rendered); NULL on failure
  verification        jsonb,                               -- per-claim verdicts + counts (audit); NO chain-of-thought
  usage               jsonb,                               -- { promptTokens, completionTokens, totalTokens, reasoningTokens }
  latency_ms          integer,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

-- One reasoning record per authoritative run: the handler UPSERTs on this key, so a
-- re-enqueue / job retry / admin regenerate overwrites rather than duplicates
-- (idempotent). Opening Findings never creates a row → never triggers a model call.
CREATE UNIQUE INDEX IF NOT EXISTS research_reasoner_runs_analysis_run_uidx
  ON research_reasoner_runs (analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_research_reasoner_runs_source
  ON research_reasoner_runs (source_kind, source_id, created_at DESC);

-- No client access. RLS ON + explicit deny-all → only the service role (jobs worker /
-- the server-side Findings read via supabaseAdmin) may read or write; no anon/authenticated
-- tenant can reach reasoner output directly through the client.
ALTER TABLE research_reasoner_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_anon ON research_reasoner_runs USING (false);

COMMENT ON TABLE research_reasoner_runs IS
  'Gated Research Reasoner runs: model-produced, verifier-checked research intelligence for a survey analysis run. Read server-side only, behind RESEARCH_REASONER_ENABLED/admin; never authoritative; deterministic Findings is the fallback.';

NOTIFY pgrst, 'reload schema';
