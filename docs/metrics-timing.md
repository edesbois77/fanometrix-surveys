# Timing metrics — canonical event model

Status: **canonical**. This is the source of truth for the two survey timing
metrics. Any dashboard, export, or report that surfaces them must match the
definitions below. If you change an event, timestamp, population, or formula
here, update every surface in the "Where surfaced" table in the same change.

The **plain-English definitions** of these (and all Collection Health) metrics
live in the canonical metric registry — `lib/metrics/registry.ts`, surfaced in
the UI via `MetricInfo`. This document is the authority on the **event model /
computation**; the registry is the authority on **wording** (definition, why it
matters, display format). Keep the two in sync.

Both metrics are derived **exclusively from the `survey_events` log** — never
from `responses.response_duration_seconds`. That column still exists (and, since
this release, is measured first-answer → completion for the CSV/Looker export),
but the dashboards do **not** read it for these tiles. One source of truth =
one number.

---

## The event model

Every survey session emits a stream of events into `survey_events`, keyed by a
single `session_id` (one stable UUID per embed load — `app/embed/page.tsx`) with
a server-stamped `created_at` (`TIMESTAMPTZ DEFAULT now()`). The events relevant
to timing, in order:

| Event | Fires when | Emitted by |
|---|---|---|
| `SURVEY_RENDER` | The survey creative **loads** (on mount, once questions are ready) — one per ad load, regardless of viewport. Both renderers now fire this on load. = **Impressions (Loads)**. | both renderers |
| `SURVEY_VISIBLE` | The survey genuinely enters the viewport (IntersectionObserver, threshold 0.1). = **Impressions (Viewable)** + start of TTFI. **New in this release.** | both renderers |
| `SURVEY_START` | The respondent selects their **first answer** (Q1). | both renderers |
| `SURVEY_COMPLETED` | The respondent answers the **final question** (survey submitted). | both renderers |

**Exposure metrics:** Impressions (Loads) = `SURVEY_RENDER` count · Impressions
(Viewable) = `SURVEY_VISIBLE` count · **Viewability** = Viewable ÷ Loads.
Historically Themed's `SURVEY_RENDER` fired on *viewport entry*, not load, so
Themed loads before this release are under-counted (Classic was always load-based);
`SURVEY_VISIBLE` is forward-only, so Viewability is available from this release
onwards. The funnel rates (Q1 Answer Rate, Overall Conversion Rate) use Impressions
(Loads) as the denominator.

`created_at` is server-insert time, so there is sub-second network jitter between
the client event and the row timestamp. This is negligible against multi-second
timing averages.

---

## Metric 1 — Avg Completion Time

> How long an engaged respondent takes to complete the survey.

- **Event fired (start):** `SURVEY_START`
- **Event fired (stop):** `SURVEY_COMPLETED`
- **Timestamp captured:** `created_at` of each event, paired by `session_id`
- **Population:** sessions that **completed** (have both a START and a COMPLETED). Completion time is only defined for completers.
- **Formula:** `avg( SURVEY_COMPLETED.created_at − SURVEY_START.created_at )` over qualifying sessions, in seconds. Non-positive deltas (clock skew / out-of-order inserts) are discarded.
- **History:** ✅ **Full history / backfilled.** START and COMPLETED have been emitted by both renderers since event tracking began (migration 042), so this metric is correct across all historical data with no migration — computing it from events *is* the backfill.
- **Note:** before this metric moved to events, dashboards read `response_duration_seconds`, whose timer started at component **mount** (page-dwell, ~100s), not at the first answer. That figure is superseded and no longer shown on the dashboards.

## Metric 2 — Avg Time to First Interaction (TTFI)

> How effective the creative is at attracting engagement.

- **Event fired (start):** `SURVEY_VISIBLE`
- **Event fired (stop):** `SURVEY_START`
- **Timestamp captured:** `created_at` of each event, paired by `session_id`
- **Population:** sessions that **engaged** (have both a VISIBLE and a START) — i.e. **everyone who answered Q1**, whether or not they completed. This is deliberately a broader population than Completion Time.
- **Formula:** `avg( SURVEY_START.created_at − SURVEY_VISIBLE.created_at )` over qualifying sessions, in seconds. Zero is allowed (instant answer); negative deltas are discarded.
- **History:** 🚀 **From this release onwards — NOT backfilled.** `SURVEY_VISIBLE` did not exist before this release. Historical sessions have no trustworthy "became visible" timestamp (Themed's old `SURVEY_RENDER` was viewport, but Classic's was data-load, and the two can't be reliably separated retroactively). Per the "trustworthy history over long history" decision, TTFI is measured forward-only. Tiles render `—` with an "available from this release" note until data accrues.

---

## Distinguishing backfilled vs launch-forward (product requirement)

The dashboards must make the provenance obvious:

- **Avg Completion Time** — full history. No caveat.
- **Avg Time to First Interaction** — a "new — from this release" / "available from this release" sub-label whenever the sample is empty, plus a tooltip stating it is measured from this release onwards and not backfilled.

This is driven by the `ttfi_sample` / `completion_sample` counts returned by the
API: a zero sample renders the launch-forward state rather than a misleading `0s`.

---

## Where surfaced

| Surface | File | Both metrics? | Notes |
|---|---|---|---|
| Timing aggregation | `lib/survey-timing.ts` | — | Single computation used by every surface below. |
| Timing API | `app/api/dashboard/events/route.ts` | ✅ | Returns `avg_completion_seconds`, `avg_ttfi_seconds`, `completion_sample`, `ttfi_sample` alongside the funnel counts, honouring the same filters/scoping. |
| Project Dashboard | `app/dashboard/components/KpiCards.tsx` | ✅ | Engagement Metrics row. |
| Campaign Dashboard | `app/campaigns/[id]/page.tsx` | ✅ | KPI row; timing fetched from the timing API. |
| Explorer (per-dimension) | `app/dashboard/components/Explorer.tsx` | ⚠️ Completion only | Per-dimension breakdown still shows a response-based completion figure (renamed "avg completion time"). **TTFI is intentionally not shown per-dimension:** it is an all-engagers metric that does not map onto completer-only response rows, and `survey_events` lacks the `club` / `competition` / `fan_segment` columns Explorer groups by. See "Known limitations". |
| CSV / Looker export | `app/reporting/page.tsx`, `app/looker-templates/page.tsx`, `responses.response_duration_seconds` | Completion only | Export keeps the raw `response_duration_seconds` column (now first-answer → completion for new rows). Deliberately **not** renamed downstream, to avoid breaking existing Looker measures. No TTFI column is exported. |

## Filters & scope

The timing API applies the **same** dimension filters, date range, and
access-control scoping as the funnel counts. `survey_events` carries
`campaign_id, publisher, placement, placement_id, creative_id, country, device,
browser` — so timing can be filtered by those, but **not** by `club`,
`competition`, or `fan_segment` (not present on events).

## Known limitations

1. **TTFI has no per-dimension Explorer view** (schema + population reasons above).
2. **`club` / `competition` / `fan_segment` cannot filter timing** — those columns don't exist on `survey_events`. On the Campaign Dashboard, applying one of those filters narrows the response-based cards but not the timing tiles.
3. **`created_at` is server-insert time**, not client event time — fine for averages, not for per-session forensics.
4. **Dropped events** (network failures; events are fire-and-forget with `keepalive`) drop that session from the sample. This slightly reduces sample size but does not bias the mean.
5. **Scale:** timing is aggregated in JS over queries bounded by *engaged* sessions (`SURVEY_START`), not renders. If starts reach the hundreds of thousands, promote `lib/survey-timing.ts` to a Postgres RPC / materialized rollup.
