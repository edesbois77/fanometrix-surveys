# Survey Studio ↔ Analytical Core — shadow integration (Stage 5C)

**Shadow-only. The Core is NOT the production authority. No Core output reaches users.**

## What is built (additive, in `lib/core/`)
- `adapter.ts` — read-only `studioToDiscoveryInput()` (preserves ids/wording/counts/bases; uses counts so the Core computes proportions itself — no scale conversion).
- `shadow.ts` — `runStudioShadow()`: **feature-flagged (default OFF)** and **failure-isolated** (never throws; returns `skipped` / `completed` / `failed`). Produces an `AnalyticalRun` for evaluation only.
- Real semantic model adapters (`../semantic/model/judges.ts`) resolve **validated** grouping/synthesis/disconfirmation verdicts upstream; the deterministic pipeline consumes them via a `FixtureGroupingJudge`, so the model never gains analytical authority. CI never calls a live model.

## Feature flag
`ANALYTICAL_CORE_SHADOW_ENABLED` (env). Set to `"true"`/`"1"` to enable shadow execution; anything else (incl. unset) keeps it **off**. No new config system was introduced (none exists in-repo).

## The production hook is DEFERRED (and why)
The Studio analysis routes (`app/api/studio/surveys/[id]/analysis/route.ts`, `.../studies/[id]/analysis/route.ts`) call `await analyseSurvey(...)` / `await analyseStudy(...)` **synchronously in the request** and are being **actively edited by another session**. Wiring a shadow call inline would (a) risk added request latency and (b) conflict with concurrent edits. Therefore the actual production hook is **not** wired in this stage.

When Studio settles, add the hook as an **enqueue via `lib/jobs`** (not inline), roughly:

```ts
// after the existing analysis has completed and its output has been persisted:
if (shadowEnabled()) {
  await enqueueJob({ kind: "core_shadow_analysis", ref: surveyId, payload: { /* governed results */ } });
  // the job builds StudioGovernedInput, resolves real-model verdicts, calls runStudioShadow,
  // and stores the AnalyticalRun in a clearly-isolated shadow store — never the Finding tables.
}
```

Guarantees the hook must preserve: fire-and-forget (no dependency of the production response on Core completion), failure isolation, shadow-labelled logs, model cost attributable to shadow, and **no** user-facing Core output.
