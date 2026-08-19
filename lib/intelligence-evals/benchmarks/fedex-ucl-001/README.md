# Benchmark Study 001 — FedEx UCL Study

The first Fanometrix analytical benchmark. A human defined what **excellent
analysis of this study should discover, what it may discover, and what it must
never claim**, so that future versions of Fanometrix's analytical intelligence
can be measured on **judgement**, not prose.

## The study

Two waves of the FedEx UEFA Champions League sponsorship survey, three common
questions:

- Combined respondents **n = 274** (Survey 1 **n = 196**, Survey v2 **n = 78**).
- Q1 `q_fit` — "FedEx as a Champions League sponsor?"
- Q2 `q_offer` — "What should sponsors offer fans?"
- Q3 `q_help` — "How could FedEx help fans most?"

## Source of record, and one deliberate scope boundary

The Gold Standard was reviewed against the exported CSV
**`FedEx-UCL-Study-Survey-Results.csv`**. That file is not committed to the
repo; its aggregates are transcribed into [source.ts](./source.ts), which is the
benchmark's own, production-independent copy.

Those aggregates were verified to match the repository QA fixture
`lib/studio/qa/fedex-fixture.ts` **exactly** for all three common questions and
the Survey-1/Survey-v2 split. A test enforces this
([source.test.ts](./source.test.ts) → "DRIFT CROSS-CHECK"): if that fixture is
ever changed away from these numbers, the benchmark **fails loudly** rather than
silently reconciling.

**Scope boundary (documented, not reconciled):** the fixture *also* carries
per-country distributions from a separate "live probe". The source CSV for this
benchmark contains **no country segmentation**. Country/market claims are
therefore **NOT ASSESSABLE from Benchmark 001's source** (`not_in_source` in
[benchmark.json](./benchmark.json), and MUST NOT SAY #9). They are neither scored
as supported nor auto-failed — to assess them, the governed country data must
first be incorporated into a benchmark.

## What this benchmark tests

Five human-defined **MUST FIND** concepts, in expected priority order:

1. **Relevance foundation, qualified by clarity/visibility** — ~64.6% perceive
   at least *some* relevance (33.6% strong fit + 31.0% relevant-but-unclear); the
   story is the **structure of the distribution**, not the 2.6pp gap between the
   top two options.
2. **Rewards/benefits lead general sponsor expectations** (36.5%, ~14.6pp ahead).
3. **Access to experiences leads the FedEx-specific question** (32.8%, ~8.3pp).
4. **Cross-question value-and-access synthesis** across Q2/Q3 — *synthesis, not
   arithmetic*: `36.5% + 32.8%` must **never** be summed.
5. **Different states of sponsorship recognition/understanding** — not a
   likes-vs-dislikes binary, and **not** a demonstrated journey/funnel.

Plus **MAY FIND** items (wave differences with proper base handling; the 64.6%
composition as supporting evidence; the 10.6% brand-visibility result) and nine
**MUST NOT SAY** failures — overstated "dominant" lead, ignoring option
semantics, arbitrary arithmetic (55.8% "visibility problem"), unsupported
causation, cross-question arithmetic (69.3%), false direct comparison, invalid
trend claims, respondent-level inference from aggregates, and out-of-source
country claims.

The full, machine-readable definition is [benchmark.json](./benchmark.json).

## Why the findings were human-defined

Analytical quality is a matter of research judgement — which findings matter,
how far the evidence can be pushed, what must be caveated. That judgement cannot
be derived from the data alone, so a human encoded it once, here, as the
reference the machine is measured against. The benchmark's `principles[]` (P1–P10)
are the general rules this study exposes and are candidate inputs to the
**Fanometrix Analysis & Insight Standard v1**.

## Why exact prose is not scored

A good analysis may express "≈two-thirds see at least some relevance" in many
ways. Scoring string similarity would reward mimicry and punish legitimate
rephrasing. So the Gold Standard scores **concepts, evidence and rules**:
did the analysis express the concept, ground it in the right evidence, respect
the required caveats, avoid the forbidden extensions, and rank the story
appropriately?

## What is machine-scoreable today (and what is not)

| Dimension | Tier | Now? |
|---|---|---|
| Arithmetic validity (allowed vs forbidden groupings; any cross-question sum) | deterministic | ✅ |
| Numeric grounding (every stated % is a governed figure or allowed grouping) | deterministic | ✅ |
| Selectivity (not rewarded for more findings) | deterministic | ✅ |
| Not-in-source (country) claim flagging | deterministic | ✅ |
| Overstated-lead / trend / causal MUST-NOT-SAY | deterministic-heuristic (flags) | ⚠️ precision aid; paraphrases evade |
| Must-find recall & ranking | structured-output | ✅ *if the producer self-tags findings* |
| Semantic must-find recall (concept expressed in any words) | model-assisted | ⛔ manual judge only |
| Acceptable-interpretation / forbidden-extension match | model-assisted | ⛔ manual judge only |
| Cross-question synthesis *quality* | model-assisted | ⛔ (code confirms no prohibited **sum**; validity is semantic) |
| "Did it tell the real story?" | human | ⛔ |

The deterministic and structured tiers run in CI ([scoring.test.ts](../../scoring.test.ts)).
The model-assisted tier is the manual [model-judge.ts](../../model-judge.ts).

## Running a future analytical engine against this benchmark

1. Produce the engine's analysis and adapt it to the neutral
   [`AnalysisUnderTest`](../../capture-contract.ts) shape (findings with
   `statedNumbers`, `citedQuestions`, optional `claimsMustFindId`).
2. Deterministic + structured score:

   ```ts
   import { scoreBenchmark } from "@/lib/intelligence-evals/scoring";
   import { loadFedexBenchmark, fedexSourceModel } from "@/lib/intelligence-evals/benchmarks/fedex-ucl-001/benchmark";
   const score = scoreBenchmark(analysis, loadFedexBenchmark(), fedexSourceModel());
   // score.gate.arithmeticViolations === 0 and .ungroundedNumbers === 0 are hard gates.
   ```
3. Optionally run the manual semantic judge for concept-recall.

This is how the three comparison points will be produced over time:
**Existing Fanometrix → baseline**, **Shared Core v1 → new**, **future revisions
→ regression/improvement**.
