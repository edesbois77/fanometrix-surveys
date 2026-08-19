# Fanometrix Intelligence Evals

Benchmark infrastructure for measuring the **quality of Fanometrix's analytical
judgement** — not merely whether a pipeline returned valid output.

The question this exists to answer over time:

> Did a change to Fanometrix actually **improve the quality of its analysis** —
> identifying the important findings, avoiding weak/false ones, ranking them
> correctly, respecting the evidence — or merely return valid output?

This directory is **evaluation-only**. It imports **nothing** from production
analytical code (no Survey Studio, no `lib/analysis`, no Supabase, no OpenAI in
the CI path) and therefore **cannot affect production behaviour**. It lives under
`lib/` deliberately, so the existing test runner (`lib/**/*.test.ts`) discovers
its deterministic tests with **no build/config change**.

> Status: **Stage 0** of the Fanometrix Intelligence Framework. This is the
> benchmark + scoring scaffolding only. It does **not** implement the shared
> Analytical Core, and it does not change any production analysis. The
> **Fanometrix Analysis & Insight Standard v1** is being defined separately; the
> benchmark's `principles[]` are candidate rules for it, preserved as metadata.

## Layout

```
lib/intelligence-evals/
  README.md                 ← this file
  schema.ts / schema.test.ts        the machine-readable benchmark representation + validator
  scoring.ts / scoring.test.ts      the pure, tiered, honest scorer
  capture-contract.ts               AnalysisUnderTest: the engine-neutral input the scorer reads
  capture/README.md                 how to capture a producer's output (Survey Studio baseline is DEFERRED)
  model-judge.ts                    OPTIONAL, MANUAL semantic judge (never run in CI; calls OpenAI)
  benchmarks/
    fedex-ucl-001/
      README.md                     what this benchmark tests + why
      benchmark.json                the human-defined Gold Standard (portable, schema-validated)
      benchmark.ts                  loader (injects source hash, validates) + SourceModel builder
      source.ts / source.test.ts    the study's source aggregates + integrity + fixture drift check
```

## Core idea: score judgement, not prose

A benchmark is **not a snapshot test**. A future engine may express the same
insight in different words and still pass. So the Gold Standard is expressed as
**concepts, evidence, and rules**, never required wording:

- `must_find[]` — findings the analysis should surface (concept + evidence +
  acceptable interpretations + required caveats + forbidden extensions).
- `may_find[]` — legitimate but secondary; must not displace the main story.
- `must_not_say[]` — prohibited/unsupported claims (bad arithmetic, unsupported
  causation, respondent-level inference from aggregates, invalid trends, …).
- `allowed_groupings` / `forbidden_groupings` — the exact arithmetic that is and
  isn't defensible (e.g. `33.6% + 31.0% = 64.6%` allowed; `36.5% + 32.8% = 69.3%`
  forbidden — different questions).
- `principles[]` — the general analytical rules the study exposes.

## Honest scoring: four tiers

We would rather have a **small honest harness** than a sophisticated-looking one
that produces meaningless scores. Every scoring dimension declares its tier, and
anything not safely decidable by code today returns `unscoreable` **with a
reason** — never a fabricated number.

| Tier | Meaning | Examples (this benchmark) |
|---|---|---|
| **1 · deterministic** | pure code decides it now | arithmetic validity, numeric grounding, prohibited-sum detection, selectivity counts, not-in-source (country) flagging |
| **2 · structured-output** | decidable **if** the producer emits structured, self-tagged findings | must-find recall, ranking quality |
| **2h · deterministic-heuristic** | high-precision lexical **flags** (a clean pass is *not* proof of absence) | overstated-lead / trend / causal MUST-NOT-SAY flags |
| **3 · model-assisted** | needs a semantic judge (kept out of CI) | semantic must-find recall, acceptable-interpretation match, synthesis-vs-arithmetic judgement |
| **4 · human** | needs human judgement for now | "did it tell the real story?", explanatory value |

See [scoring.ts](./scoring.ts) and the FedEx benchmark's
[README](./benchmarks/fedex-ucl-001/README.md) for the exact boundary.

## Running

Deterministic tests run inside the normal suite:

```bash
npm test                                             # whole repo
node --import tsx --test "lib/intelligence-evals/**/*.test.ts"   # just the evals
```

The optional semantic judge is **manual only** (calls OpenAI, never in CI):

```bash
npx tsx lib/intelligence-evals/model-judge.ts <path-to-captured-analysis.json>
```

## Adding Benchmark Study 002, 003, …

1. Create `benchmarks/<id>/`.
2. Add `source.ts` — the study's own, production-independent source aggregates,
   plus a `sourceHash()` and a `governedNumbers()` / `SourceModel` builder.
3. Add `benchmark.json` — the human-defined Gold Standard (validated by
   [schema.ts](./schema.ts)).
4. Add `benchmark.ts` — loader that injects the source hash and validates.
5. Add tests: source integrity (bases, arithmetic), schema validity, and — if a
   repository fixture exists for the study — a **drift cross-check** against it
   (see [fedex-ucl-001/source.test.ts](./benchmarks/fedex-ucl-001/source.test.ts)).
   If a repo fixture ever diverges from the study's source of record, the
   cross-check must **fail loudly** rather than silently reconcile.
6. Write `benchmarks/<id>/README.md` documenting what it tests and why.

The scorer in [scoring.ts](./scoring.ts) is study-agnostic — a new benchmark
supplies its own `SourceModel` and reuses it unchanged.
