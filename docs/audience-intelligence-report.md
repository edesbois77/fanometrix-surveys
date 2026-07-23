# Audience Intelligence Report

The partner reporting framework. Every completed Fanometrix research campaign can
generate one of these for the publisher partner whose audience carried it.

First instance: **LiveScore, FedEx UEFA Champions League Sponsorship Study**.

Status: **in production**.

---

## 1. What this is

A premium consultancy deliverable, not an operational dashboard. It answers
*"what did we learn together from this campaign"* rather than *"how did this
publisher perform"*.

It is also a sales document. It is written on the assumption that the person who
receives it forwards it to their Head of Commercial or Managing Director, and
that this reader arrives cold, three levels away from whoever commissioned the
work. Every section therefore stands on its own, leads with value, and never
requires the reader to interpret a rate before they see a result.

**Route**: `/reports/<org>/<report>` — for the first instance,
`/reports/livescore/fedex-phase-1`.

---

## 2. Framework, not a page

Nothing about a partner, brand or campaign lives in code. A report is a row in
`partner_reports` (migration 138):

| Column | Purpose |
|---|---|
| `org_slug`, `report_slug` | URL identity |
| `organisation_id` | real FK to `organisations`, ready for the Organisations area |
| `organisation_name`, `brand_name` | display names in the hero |
| `report_title`, `campaign_title`, `research_question` | headings |
| `logo_url` | the partner's mark for the cover; optional |
| `version` | revision shown on the cover, bumped on every re-issue |
| `campaign_ids` | the exact campaigns in scope; every figure comes from these and only these |
| `data_from` | excludes pre-launch QA traffic |
| `password_hash` | bcrypt, per report |
| `status` | draft / published / archived |

Issuing the next partner report is an INSERT, run through
`scripts/issue-partner-report.ts`, not a deploy. That script names campaigns by
their campaign number (`#000124`), resolves them to the text `campaign_id` the
event tables use, and **refuses to write a report whose campaigns span more than
one publisher organisation** — the single mistake this feature exists to prevent.

```
npx tsx scripts/issue-partner-report.ts \
  --org-slug livescore --report-slug fedex-phase-1 \
  --organisation "LiveScore" --brand "FedEx" \
  --campaign-title "FedEx UEFA Champions League Sponsorship Study" \
  --campaign-numbers 124,125,126,127,128,144 \
  --data-from 2026-07-20T00:00:00Z \
  --password "…"
```

### Files

| Path | Role |
|---|---|
| `supabase-migration-138.sql` | `partner_reports` table |
| `lib/reports/types.ts` | the report model |
| `lib/reports/stats.ts` | two-proportion z-test, margin of error, confidence bands |
| `lib/reports/data.ts` | rollup + unsealed-tail reads, paged |
| `lib/reports/engine.ts` | computes the whole report from live data |
| `lib/reports/csv.ts` | the two standard CSV exports |
| `lib/reports/timezones.ts` | country to IANA zone, for local-time engagement |
| `lib/reports/access.ts` | per-report password + signed unlock cookie |
| `lib/reports/definition.ts` | loads a report definition |
| `app/reports/theme.ts` | validated data palette, document chrome |
| `lib/reports/narrative.ts` | who a report is for: section order, titles, standfirsts |
| `app/reports/components/` | charts, document furniture, creative gallery, the report itself |
| `app/reports/[org]/[report]/` | route, password gate, print stylesheet |
| `app/api/reports/[org]/[report]/` | unlock, CSV downloads |
| `scripts/issue-partner-report.ts` | issue or re-issue a report |

---

## 3. Who a report is for

`partner_reports.audience` selects a narrative profile (`lib/reports/narrative.ts`):
which sections appear, in what order, and who the copy addresses. The
measurement engine is audience-neutral and stays that way, because the numbers
are the numbers. Only `publisher` is written; `brand`, `agency` and `internal`
are accepted by the schema and fall back to it, deliberately unwritten rather
than approximated. Adding one is a profile plus a value in that column, never a
change to `engine.ts`.

---

## 4. Report flow

0. **Cover** — Fanometrix mark, "Prepared for <organisation>" (logo when supplied, the
   name in display type when not), report title, campaign, the research question,
   an Interim/Final status badge, the metadata strip and a numbered contents list
The publisher order leads with insight and closes with method, because that is
the order the reader cares about:

1. **Highlights** — outcomes before statistics
2. **Executive Summary** — the decisions this report supports, each with what acting is worth, then the KPI cards
3. **What Fans Told Us** — every answer, overall and by market
4. **The Creative** — the units that ran, rendered live
5. **Creative Comparison** — normalised, with confidence labels
6. **Country Performance** — indexed against the campaign average
7. **Engagement Trends** — four hourly charts in the audience's local time
8. **Audience Reach** — two funnels, one denominator each
9. **What We Learned** — confirmed findings and possible explanations, never merged
10. **Value Delivered** — what the partnership produced, on the navy band
11. **Recommendations** — numbered, each naming the evidence it rests on
12. **Downloads** — Executive PDF, Raw Responses CSV, Campaign Metrics CSV
13. **Methodology** — how the numbers were produced, and every caveat

A sticky rail keeps the whole structure one click away. Technical caveats live
in Methodology rather than interrupting the narrative; sections that reference
one point to it.

Every section carries its number and is anchored, so the contents list on the
cover is navigable and a reader who was forwarded one section knows where it
sits. The numbering is derived from the sections the report actually contains:
Creative Comparison only exists when a campaign ran more than one creative, and
the spine stays contiguous either way.

### Provenance

The metadata strip appears twice, on the cover and at the close, built from one
source so the two cannot drift: **Report status** (Interim while any campaign is
still collecting, Final once they close), **Reporting period**, **Data through**,
**Report generated**, **Version**. Data-through and generated-at are deliberately
separate: one says how current the data is, the other says when someone asked.

---

## 5. The bar

Every section has to earn its place against one question: *if I were the Head of
Commercial here, what would I do differently tomorrow because I read this?*

That is why the Executive Summary is a list of decisions rather than a list of
metrics, why each decision carries what acting on it is worth in responses or
impressions rather than an adjective, and why a decision whose value cannot be
computed honestly says so and is framed as a test instead. It is also why
"no clear difference" is stated as a finding in its own right: knowing which
lever does *not* move is a decision input too.

---

## 6. Positioning rules held in code

- **No other publisher is nameable.** The engine only ever loads the campaigns in
  the report's own `campaign_ids`. There is no code path that could read another
  partner's delivery, response or commercial data, so the guarantee is
  structural rather than editorial.
- **Comparisons are market-against-campaign**, indexed at 100. The benchmark is
  the campaign's own weighted average.
- **No academic language.** p-values, z-scores and test names never reach the
  page. The statistics decide what is shown; the reader sees High Confidence,
  Moderate Confidence or Early Observation, with a plain-English key.
- **A difference that fails the 95% bar is reported as "no clear difference"**,
  not as a smaller result. The creative start-rate gap is the live example.
- **Confirmed and possible are different types**, rendered in different columns
  with different borders. A hypothesis is never phrased as a fact.
- **Markets below 30 completed responses** are shown in full and never described
  as different from the campaign.
- **No em-dashes** anywhere in report copy.

---

## 7. Data handling

**Event counts** union the hourly rollup below the watermark with raw
`survey_events` above it, exactly as `dashboard_event_counts` does. Reading only
the rollup would silently drop the most recent hours on a report that stamps
itself "data through".

**Excluded by construction:**
- `QUESTION_2_REACHED` — fires within a second of `SURVEY_START` and equals it, so
  it is not a funnel stage.
- `SURVEY_EXIT` — emission was removed from the embed; surviving rows are
  inconsistent residue.
- Pre-launch QA traffic — via `data_from`.

**Viewability** is forward-only from the release that introduced
`SURVEY_VISIBLE`. The report finds that instant itself and quotes viewability
only against loads from that window, so a campaign that ran mostly before it
cannot appear to have failed on delivery.

**Local time** is resolved through a real IANA zone per market, so a campaign
running across a DST boundary still reports the hour the fan was holding the
phone.

**Which creative ran** is resolved the way the embed resolves it, not from
`campaigns.creative_design` alone. A blank column means *inherit*, not *default*:
the embed falls back to the design on the survey's `research_project_evidence`
row (`app/api/embed/campaign/route.ts`, survey-scoped since migration 094).
Reading the campaign column by itself named a creative that was never served,
which put a unit no fan saw into the gallery and the wrong baseline into the
comparison. If that inheritance changes, `fetchEffectiveCreatives` has to change
with it.

**Viewability is not in the delivery funnel.** It is measured over a shorter
window than the campaign ran for, so a funnel headed "share of impressions
delivered" cannot carry it without inviting the reader to divide it by the total
and conclude the figure is wrong. It sits alongside, with its own denominator
and start date stated.

**Creative ordering** is by first observed delivery, never by `start_date`. In
this dataset campaign #000144's `start_date` predates its own `created_at`, which
would have inverted the baseline and the challenger and reversed every headline.

---

## 8. Design

Built on the workspace design system's tokens, in a print-first document
variant: white surfaces, navy and gold as chrome, large whitespace, typography
carrying the hierarchy.

**The creative gallery** renders the production embed components, not
screenshots. A screenshot goes stale the moment a design is edited and nobody
notices; the real component is correct by construction. `isPreview` hard-gates
event emission in both `ClassicSurvey` and `ThemedSurvey`, so the gallery writes
no impressions, starts or responses, which matters because these campaigns are
still collecting and a gallery that fired events would corrupt the figures the
report quotes.

**Charts** are hand-rolled server-rendered SVG. No chart library: the report has
to print to PDF without re-laying out, render with JavaScript blocked, and sit
exactly on the document grid. Each chart's viewBox is sized to the width it is
laid out at, so label sizes stay consistent across the document.

**Data colour is separated from brand colour.** Navy `#0B1929` and gold
`#D7B87A` dress the document. They are not used for data marks: navy sits far
outside the categorical lightness band and reads as near-neutral, and gold is
1.9:1 against white. The data layer uses brand-adjacent steps validated against
a `#FFFFFF` surface:

| Slot | Hex | Use |
|---|---|---|
| Series 1 | `#1D5FA8` | every single-series chart |
| Series 2 | `#BE861A` | the challenger in a two-series comparison |
| Funnel ramp | `#93AEC6`, `#5C82A6`, `#2C5480`, `#0B1929` | ordered funnel stages only |

Series 1 and 2 pass every categorical check (lightness band, chroma floor, CVD
separation ΔE 27 protan / 26 tritan, normal-vision ΔE 32, contrast at or above
3:1). The funnel ramp passes the ordinal checks (monotone lightness, adjacent ΔL
at or above 0.06, light end 2.31:1, 8° hue spread). Nominal answer options are
never given a value ramp: they are single-hue bars with direct labels.

**Executive PDF** is the browser's own print-to-PDF over the report's print
stylesheet, deliberately not a second rendering path. One source, one set of
figures, and the PDF is always current with the data the page just computed.

---

## 9. Security and SEO

- **Per-report password**, bcrypt-hashed. Unlocking mints a signed cookie scoped
  to one report id; it is not a session and grants nothing on the platform.
- The unlock endpoint returns the same message for an unknown report and a wrong
  password, with a fixed delay on failure.
- Nothing about the campaign reaches the browser before the password is answered.
- CSV downloads are gated by the same cookie and 404 without it.
- **Never indexed**: `noindex, nofollow, noarchive, nosnippet, noimageindex` in
  route metadata, an `X-Robots-Tag` header from middleware (which also covers the
  CSVs, where meta tags cannot reach), and `Disallow: /reports` in `robots.txt`.
  In no sitemap.

---

## 10. What the first report currently says

Computed live on 2026-07-23, data through 07:53 UTC. Every figure moves until
collection closes on 2026-07-24.

757,565 impressions · 243 completed responses · 5 markets · 97% mobile ·
±6.3% at 95% · 81% viewability over the measured window.

**Confirmed**: Fan Invitation raised completion from 41% to 86% and yield from
6.3 to 10.7 responses per 10,000 impressions; the two creatives started fans at a
comparable rate (no clear difference); Germany's prompted awareness is materially
lower than the rest of the campaign; the UK prioritises fan experience over
grassroots investment where the rest of the campaign does the opposite.

**Possible, and labelled as such**: that Fan Invitation's advantage is
self-selection at the opt-in gate rather than a better survey experience; that
time of day shapes engagement as well as volume.

**Disclosed on the page**: Germany ran a different creative from the other
standard markets; the UK index is inflated by running two creatives; the creative
test was sequential, sharing one hour of live delivery.

---

## 11. Known limits, carried into the next campaign

- The creative test is a sequential read, not a side-by-side split. The direction
  is reliable; the exact size is indicative. Recommendation 2 in the report asks
  for a concurrent split next time, which costs no additional inventory.
- Viewability exists only from 2026-07-22 07:00 UTC onward.
- No demographic fields are captured (`age_band`, `gender`, `club`,
  `competition`, `fan_segment` are null on every row), so no audience
  segmentation is possible in v1.
- `placement` is single-valued (`run-of-network`), so no placement breakdown is
  possible. The column is still emitted in the CSVs as a join key.
- `responses.creative_id` is null on every row; creative attribution is derived
  from the campaign, and the CSV notes it.
- No LiveScore logo has been supplied. The cover sets the organisation name in
  display type instead, which is a deliberate design rather than a gap. Pass
  `--logo-url` to the issue script to use a mark.

---

## 12. Readership

The cover shows how much the report has been read: distinct readers, and total
visits. It counts **browsers, not people** — the same person on a laptop and a
phone is two readers, two colleagues sharing a machine are one — and the
methodology section says so on the page rather than leaving the figure to imply
more precision than it has.

A random identifier in an httpOnly cookie (`fmx_reader`) carries no personal
data and is meaningless outside `partner_report_visits`. The beacon fires from
the browser after the password, so gate views and crawlers never count, and the
write is a POST rather than a side effect of rendering, which a prefetch or a
retry would fire again.

Two things worth deciding rather than assuming:

- **The publisher sees their own number.** It reads as engagement when the
  figure is healthy and as indifference when it is not. Moving it behind an
  internal-only view is a change to the narrative profile, not to the counting.
- **Fanometrix views count too.** Every time we open a partner's report to check
  it, we add a reader. Excluding them needs a marker on our own browsers; until
  there is one, early numbers on a new report are mostly us.

---

## 13. Backward compatibility

Reports are generated from live data on every request, so there is no stored
output to migrate and an old report picks up engine improvements automatically.
The compatibility surface is therefore the `partner_reports` row, and the rule
is that changes to it must be additive:

- **New columns go in `OPTIONAL_COLUMNS`** (`lib/reports/definition.ts`) with a
  default applied in `toReport`. The read tries the full column list, and falls
  back to the core list if the database does not have the new column yet. A
  deploy that precedes its migration therefore renders with defaults rather than
  404ing, and a report issued before the column existed keeps working after it.
- **Migrations are `ADD COLUMN IF NOT EXISTS`**, never a rewrite of an applied
  one: 138 shipped and was extended, which is why 139, 140 and 141 exist as
  separate files. `CREATE TABLE IF NOT EXISTS` is a no-op on a database that
  already has the table, so a column added to 138 after it ran never arrives.
- **New sections are added to a narrative profile and return null when they have
  no content.** The order, the numbering and the contents rail all derive from
  what a given report actually contains, so a report whose campaigns cannot
  support a section simply does not show it.

## 14. Running it

Applied migrations: 138, 139. Optional, and degrading gracefully until applied:
140 (`audience`), 141 (`subtitle`), 142 (`partner_report_visits`, no counter
until it exists).

Issuing a report is `scripts/issue-partner-report.ts` (section 2). No deploy.
