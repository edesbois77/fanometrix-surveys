# Fanometrix Analytical Core — Stage 1 foundation

Additive, **behaviour-preserving** foundation for the shared Analytical Core, implementing **Standard v1.1** and the approved Stage 1 spec. **Nothing here is wired into any product** — no route, prompt, schema, or display consumes it. Its tests run under the existing `lib/**/*.test.ts` runner.

## What Stage 1 contains (Batches 1–5)
- `vocabulary.ts` — canonical Standard v1.1 enums (Decisions 1–13).
- `version.ts` — `STANDARD_VERSION` / `CORE_VERSION` / `VersionTriple`.
- `statistics/` — `POLICY_V1` (base bands, candidate bands, 95%/α=0.05), `classifyBase`, `classifyCandidateDifference`, and pure calculators `shares`, `marginOfError`, `index100`, `twoProportion` (returns the structured `StatisticalAssessment`, never a boolean).
- `evidence/`, `findings/` — presentation-neutral `Evidence`, `Result`, `Finding` (+ `Insight`/`Implication`/`Recommendation`) contracts. The chain may stop at any stage; interpretive fields are optional.
- `adapters/` — **read-only** `fromRpFinding`, `fromStudyFinding`, `fromDeterministicEngine`. They map existing data faithfully, preserve provenance, and **never** synthesise confidence/materiality/insight/recommendations.

## Invariants
- Statistics primitives are behaviour-equivalent to `lib/reports/stats.ts` (proven by equivalence tests) and to Survey Studio's distribution rule.
- Adapters populate only fields that already exist in the source; unavailable information stays absent. RP's stored grade is preserved in `sourceMeta`, not mapped to `confidence`. Studio `commentary` is provenance, not a governed Insight.
- `Result` grouping cannot be `thematic_synthesis` (type-enforced), so a synthesis can never become a number.

## NOT in Stage 1
No product wiring; no prompts/routes/schema/migrations; no materiality/confidence assignment; no semantic-grouping generation, cross-tabs, multi-select, weighting, trend analysis, jobs migration, or call-site consolidation (Batch 6 is deferred). See the Stage 1 spec for the full exclusion list.
