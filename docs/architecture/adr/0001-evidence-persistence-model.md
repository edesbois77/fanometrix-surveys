# ADR 0001 — Evidence persistence model: persist every answer, not only completions

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** Product / Engineering (FedEx calibration)
- **Supersedes:** the implicit completion-only response model
- **Relevant code:** `supabase-migration-147.sql`, `app/api/answer/route.ts`, `app/api/submit/route.ts`, `app/embed/ThemedSurvey.tsx`, `app/embed/ClassicSurvey.tsx`, `lib/analysis/source-findings/survey-population.ts`, `app/api/dashboard/events/route.ts`

---

## Context

A Fanometrix survey has up to three questions. Historically, a respondent's answers reached the database in exactly one place and at exactly one moment: **`responses`**, written by `POST /api/submit`, which the embed calls **only when the final question is answered** (`ThemedSurvey.tsx` / `ClassicSurvey.tsx`, the "last step" branch). One `responses` row = one *completed* survey, carrying `q1`, `q2`, `q3` together.

Alongside this, the embed emits lightweight funnel telemetry to **`survey_events`** (`POST /api/events`): `SURVEY_START` (fired on the first answer), `QUESTION_2_REACHED`, `QUESTION_3_REACHED`, `SURVEY_COMPLETED`. These record *that* a question was reached/answered, keyed by `session_id` and `campaign_id` — but they **carry no answer value**.

The Project Findings engine (`lib/analysis/source-findings/`) computes each survey question's findings — distributions, percentages, minorities, cross-tabs — from the respondent rows it can read. It correctly counts each question independently (`lib/analysis/survey-observations.ts`: a question's denominator is the count of rows with a valid answer to *that* question). The problem was never the counting; it was the **input population**.

### The failure this ADR responds to

During the FedEx calibration the survey funnel was:

| Question | Reached / answered |
|---|---|
| Q1 | 652 |
| Q2 | 317 |
| Q3 | 274 (completed) |

Findings reported **274 / 274 / 274**. Because `responses` holds only completed submissions, the 378 respondents who answered Q1 and abandoned before Q3 — and the 43 who reached Q2 and stopped — **never created a `responses` row**. Every question collapsed to the completed count. The platform was discarding evidence that respondents had genuinely contributed.

Worse, the missing evidence was **unrecoverable**: `survey_events` proves 652 people answered Q1, but never recorded *which option* each chose. So the choices of the 378 Q1-only respondents were never persisted anywhere.

## Decision

Adopt a two-store evidence model, and make it a standing principle:

> **An answer selected is a valid data point and is persisted immediately, even if the respondent abandons later. Findings calculate each question independently from everyone who answered that question. Completion metrics and completion reporting continue to use the `responses` table.**

Concretely:

1. **Introduce `response_answers`** (migration 147) — an append/upsert store, one row per `(session_id, question_index)`, written the instant an answer is chosen. It carries the selected `answer_value` (the option id, as text, exactly as `responses.q1/q2/q3` store it) plus `campaign_id`, `survey_id`, `country`, `fan_segment`, `market`. Unique on `(session_id, question_index)`, so re-selecting an answer updates in place.

2. **Add `POST /api/answer`** — a server-only endpoint (service-role write) that upserts one answer. It mirrors `/api/events`' validation, size guard and per-session throttle. Anonymous, non-fatal.

3. **Fire it from the embed on every selection.** `ThemedSurvey` and `ClassicSurvey` call `/api/answer` in the answer handler, immediately after the option is chosen and **before** advancing or submitting. Guarded only by preview mode (`keepalive`, errors swallowed).

4. **`responses` and `/api/submit` are unchanged.** A completed survey still writes exactly one `responses` row on the final answer.

5. **Findings read `response_answers`; completion metrics read `responses`.** `projectSurveyResponseRows` reconstructs one row per `session_id` from `response_answers` (q1/q2/q3 = that session's answer per question index, null where unanswered) when the store has data, and falls back to completed `responses` for historical surveys. Completion counts, `vw_survey_stats`, dashboards and reports keep reading `responses`.

### Population scoping (deterministic, report-free)

A project's survey population is **every response under its deployment campaigns**, where the campaigns are:

```sql
SELECT campaign_id FROM campaigns WHERE research_project_id = <projectId>;  -- NO deleted_at filter
```

No `deleted_at` filter, because a soft-deleted deployment keeps its `research_project_id` link and all its response rows. This is the same enumeration the dashboard's `/api/responses` uses. Findings **never** scope by `responses.survey_id` (inconsistently populated across a campaign's history) and **never** read a report/presentation artifact (e.g. `partner_reports.campaign_ids`).

## Why each choice

**Why the original completion-only model lost evidence.** `responses` was designed as the record of a *finished* survey — a single row with all answers, written once. That is the right shape for "how many completed and what did completers say," but it structurally cannot represent "someone answered Q1 and left." Partial answers had no row and no home, so any per-question analysis silently inherited the completion denominator.

**Why `response_answers` was introduced.** The unit of evidence is a single answer, not a completed survey. A store keyed on `(session, question)` and written at selection time captures that unit at the moment it exists, before abandonment can erase it. Reconstructing per-respondent rows from it yields honest, independent per-question populations.

**Why `responses` remains canonical for completed submissions.** Completion is a distinct, meaningful business fact with a large blast radius: `vw_survey_stats`, campaign/dashboard response counts, `is_demo` semantics, completion-rate and reporting all count `responses` as completers. Folding partials into `responses` would have jumped every "responses" figure (274 → 652 for FedEx) and quietly broken those consumers. Keeping `responses` as the completed-submission table of record preserves all of that untouched. The two stores answer two different questions and must not be conflated.

**Why Findings read `response_answers` while completion metrics read `responses`.** Evidence and completion are different measures. Findings want *every answer given* (to reason about what fans think, per question); completion reporting wants *finished surveys* (to reason about delivery and drop-off). Separating the sources lets each be correct without compromise, and makes the distinction explicit in the product rather than an accident of storage.

## How historical projects are handled

Surveys collected **before** per-answer persistence (all pre-2026-07-24 data, including FedEx) have no `response_answers` rows, and their partial respondents' option choices were never stored. For these:

- Findings fall back to the **completed `responses`** (the only respondents whose choices exist) and are honestly labelled as such.
- The true **question reach** is shown separately, derived from the `survey_events` funnel (`SURVEY_START` = Q1 answered, `QUESTION_3_REACHED` = Q2 answered, `SURVEY_COMPLETED` = Q3 completed), scoped to the project's deployment campaigns.
- The Findings page carries an explicit note: *"Partial-response option choices were not retained for surveys collected before per-answer persistence was introduced. Historical findings therefore use completed responses only, while question reach is shown separately."*

No fabricated percentages: reach is a **count**, never a distribution, because the partials' option values do not exist.

## Migration path

Additive and non-breaking, deployed in sequence, each independently:

1. **Historical honesty** — Findings over completers + reach context from `survey_events`; no schema change. (Makes existing projects correct and honest immediately.)
2. **Migration 147** — create `response_answers` (RLS: no anon; server-only writes). Applied by hand ahead of code (production Supabase is migrated by hand ahead of the deployed code). No backfill — historical partials are unrecoverable by definition.
3. **`POST /api/answer`** — the upsert endpoint.
4. **Embed change** — `/api/answer` fired on each selection, alongside the unchanged `/api/submit`.
5. **Findings prefer `response_answers`** — with the completed-response fallback for historical data.

Rollback is `DROP TABLE response_answers` plus reverting the code; `responses` and the completion path are never at risk.

## Consequences

**Positive**
- No valid evidence is discarded on abandonment; a respondent who answers one question contributes one data point.
- Per-question findings reflect true completion funnels (e.g. 652 / 317 / 274) with real option-level distributions, going forward.
- Findings vs completion are cleanly, visibly separated.
- The survey → population mapping is deterministic raw data, independent of any report.

**Negative / accepted**
- Historical partial choices remain permanently lost; those findings stay completer-based.
- A second write per answer per session (throttled, `keepalive`, non-fatal) adds modest embed traffic and a new table that, like `responses`, holds answer values (subject to the same retention/privacy posture).
- A transition window: a survey collecting across the deploy boundary mixes pre-persistence completers (in `responses` only) with post-persistence sessions (in `response_answers`); the fallback prefers the answer store once it has any rows, so pre-boundary completers of that survey may be slightly undercounted until new data dominates. Acceptable and self-healing.

## Future considerations

- **Distinct-session reach.** The funnel currently counts event rows per type (one per session in practice); switching to `count(DISTINCT session_id)` would harden reach against any duplicate events.
- **Multiple question sets per project.** Findings use the project's *default* survey's questions over the deployment population, which is correct when deployments share one questionnaire (v1/v2 of the same survey). A project deploying genuinely different questionnaires would need grouping by question set / `effective_survey_id`.
- **Linking `response_answers` to completion.** `responses` has no `session_id`; adding one (or stamping `session_id` on submit) would let a completed submission be reconciled with its per-answer rows, enabling exact dedup at the transition boundary and richer completion×answer analysis.
- **Beyond three questions.** `question_index` is capped at 0–2 to match the current survey limit; lifting the survey cap means widening this and the reconstruction.
- **Simulated / demo data.** The embed writes real traffic only; simulated evidence is generated separately and does not flow through `/api/answer`. If simulation should populate `response_answers`, that path must be added explicitly.
- **Deprecating the fallback.** Once all live projects post-date per-answer persistence, the completed-response fallback can be narrowed to a genuinely-historical-only path.
- **Retention & privacy.** `response_answers` stores answer values and light demographics like `responses`; it inherits the same retention, deletion and confidentiality obligations and should be included wherever `responses` is purged or exported.
