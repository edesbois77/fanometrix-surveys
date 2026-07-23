# M1: Permanent Event Schema

The first and most time-critical phase of
[the event analytics architecture](event-analytics-architecture.md). M1 fixes the
things that get more expensive to change with every row inserted: identity keys,
partitioning, and what we record at ingest.

M1 deliberately builds **no rollups and no query layer**. Those are M2 and M3, and
they are additive and safely iterated. M1 is the one phase that rewrites fact
tables, so it ships and gets verified on its own.

Decisions locked 2026-07-23: 30-day raw retention, `creative_id` first-class, no
direct `survey_events` reads from production code.

---

## 1. Why M1 only has to get three things right

Partitioning by day plus 30-day retention has a consequence worth stating
explicitly, because it shapes how much this phase needs to agonise over:

**After M1, no raw-table column change ever touches more than 30 days of data.**

A column type change, a new dimension, a dropped field: all of them become a
change to the partition template plus at most a month of backfill. So M1 must get
right only what is genuinely permanent:

1. **Identity.** UUID foreign keys, never slugs.
2. **Partitioning.** Because retrofitting it is what gets catastrophically
   expensive.
3. **What we capture at ingest.** Because data not recorded is lost forever and no
   migration recovers it.

Everything else, including whether `device` and `browser` become lookup enums, is
a cheap future change and is explicitly out of scope. Resisting the urge to
perfect every column now is part of the design, not a compromise on it.

---

## 2. M1.0: creative attribution is broken and losing data daily

**This ships before the migration, independently, and should ship this week.**

### The finding

`creative_id` is NULL in **100%** of rows: all 1,131,550 `survey_events` and all
5,321 `responses`. Not sparsely populated. Never populated, ever.

The write path is completely intact:

| Step | Location | Status |
|---|---|---|
| Read from URL | [app/embed/page.tsx:95](../app/embed/page.tsx#L95) | works |
| Pass to component | [app/embed/page.tsx:232](../app/embed/page.tsx#L232) | works |
| Send in payload | [app/embed/ThemedSurvey.tsx:637](../app/embed/ThemedSurvey.tsx#L637) | works |
| Validate and write | [app/api/events/route.ts:80](../app/api/events/route.ts#L80) | works |

The break is at the source: **nothing ever puts `?creative_id=` in the embed URL.**
So a fully built attribution pipeline has been writing NULL since the day it was
added.

Meanwhile the embed already knows the answer. [app/embed/page.tsx:154](../app/embed/page.tsx#L154)
receives `data.creative_design`, the design the embed API resolved server-side from
the campaign or its inherited research project, and renders with it at line 219. The
embed reports a URL parameter nobody sets instead of the design it actually showed.

### Why this is urgent rather than merely wrong

- **It cannot be backfilled.** Which creative a given impression showed is not
  recoverable from any other data. Every day this runs is a permanently
  unattributable day.
- **It explains the campaign slug problem.** Creative variants are encoded into
  slugs (`..._invitation_creative_2`) because the proper column appeared unusable.
  That is the key doing modelling work, and it is downstream of this bug.
- **It is what blocks per-creative performance.** The known gap where creative
  design performance is not attributable is this, not a missing feature.

### The fix

Report the resolved design rather than the URL parameter. `creativeDesign` state
already holds it; pass that to the survey components as the reported creative,
falling back to the URL parameter when present so any existing tagged traffic keeps
working. The same value flows to `/api/submit` for `responses`.

Scope: the embed page, the two survey components' props, and a check that
[api/submit](../app/api/submit/route.ts) is fed the same value. No schema change,
no migration, no API change.

### Verify

After deploy, `creative_id` should be non-null on new rows within minutes:

```sql
SELECT creative_id, count(*) FROM survey_events
WHERE created_at > now() - interval '15 minutes' GROUP BY 1;
```

Historical rows stay NULL permanently. The rollups in M2 must therefore treat
`creative_id IS NULL` as "before attribution existed", not as "no creative", the
same way `SURVEY_VISIBLE` is handled as forward-only in the metric registry today.

---

## 3. Target schema

```sql
CREATE TABLE survey_events_v2 (
  -- identity
  campaign_uuid  uuid        NOT NULL REFERENCES campaigns(id),
  session_id     uuid        NOT NULL,
  event_type     smallint    NOT NULL REFERENCES event_types(id),
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- dimensions
  creative_id    uuid        REFERENCES creative_designs(id),
  publisher_org_id uuid      REFERENCES organisations(id),
  placement_id   uuid,
  country        char(2),
  device         text,
  browser        text,

  -- measures (see architecture doc §4.4)
  ttfi_ms        integer,
  duration_ms    integer
) PARTITION BY RANGE (created_at);
```

Notes on each choice:

- **No primary key.** Nothing in the codebase reads `survey_events.id`; verified
  across every reference. The current random-UUID PK is the table's largest index
  at 42MB, 32% of the index footprint, and scatters inserts across the whole index
  on an append-only workload. A partitioned table's PK would have to include
  `created_at`, making it wider still. Append-only logs do not need one.
- **`campaign_uuid` replaces the 65-byte slug.** The slug is mutable, semantically
  overloaded, has no FK, and is already lossy: 8 of 77 slugs are truncated at
  exactly 80 characters, some mid-word. Two campaigns differing after character 80
  would silently merge their funnels.
- **`device` and `browser` stay text.** Enum lookup tables would save roughly 10
  bytes per row and add ingest resolution and race conditions. Per §1 this is a
  cheap change later. Not now.
- **`event_types` lookup table** so retiring a type (`SURVEY_EXIT` already has 253
  orphaned rows) is a metadata change, not a data migration.
- **Measures carried on the event** so timing metrics become additive aggregates
  and the session-join in [lib/survey-timing.ts](../lib/survey-timing.ts)
  disappears. Requires the embed to send `ttfi_ms` and `duration_ms`; validate
  `0 <= value <= 30 minutes` at ingest and count rejects so clock skew is visible
  rather than silent.

Estimated row width: ~70 to 80 bytes against today's 203.

---

## 4. Partitioning and maintenance

Daily `RANGE (created_at)` partitions. At 30-day retention that is 30 live
partitions, comfortably inside the range where pruning stays cheap.

- A `survey_events_v2_default` catch-all exists so a missed pre-creation degrades
  to "rows landed in the wrong partition", never "collection stopped".
- A job pre-creates partitions **14 days ahead** and alerts if the default is ever
  non-empty.
- Maintenance runs through [lib/jobs](../lib/jobs), not `pg_cron` directly and not
  `pg_partman`, so there stays exactly one scheduler. The handler calls a Postgres
  function that performs the DDL.
- Retention drops are **not enabled in M1.** Dropping raw before M2's rollups are
  verified is irreversible. M4 turns this on.

---

## 5. Migration sequence

Each step is independently revertible until step 7.

1. **Create** `event_types`, `survey_events_v2`, partitions for the current window
   plus 14 days, the maintenance function and job. Nothing reads or writes it yet.
2. **Dual-write.** [api/events](../app/api/events/route.ts) writes both tables in
   one request. A `_v2` write failure logs and does not fail the request: ingest
   availability outranks completeness of the new table during migration.
3. **Backfill** the 1.13M historical rows, resolving slug to `campaign_uuid` by
   joining `campaigns`. Chunk by day, run through the jobs framework, idempotent
   per chunk. At current size this is minutes.
4. **Reconcile.** Per campaign, per event type, per day: counts must match exactly.
   Any slug that resolves to no campaign is reported, not silently dropped, since
   that is the silent-detachment failure the UUID key exists to prevent.
5. **Soak** for several days with dual-write running and the reconciliation job on
   a schedule. Reads still come from the old table.
6. **Cut reads over** to `_v2`.
7. **Stop dual-write, drop the old table.** The point of no return.

Steps 1 to 5 are safe at any time. Step 6 is the one to schedule deliberately.

---

## 6. `responses` gets the same treatment

Same slug key, same absent FK, same 100%-NULL `creative_id`. It matters more than
events: an event lost in aggregate is a rounding error, a response whose campaign
attribution silently detaches is corrupted research evidence.

At 5,321 rows the migration is trivial. It is not partitioned: responses grow with
completions, not impressions, and 5k rows in 13 months needs no partitioning for
many years.

---

## 7. What M1 does not do

Stated so scope does not drift:

- No rollup tables. M2.
- No query layer. M3.
- No retention drops or archival. M4.
- No ingest batching. M5, driven by traffic.
- No enum lookups for `device` and `browser`. Cheap later, per §1.

---

## 8. Enforcing "no direct reads"

The interface stays stable only if product code is structurally unable to reach
past it. Intention is not a mechanism.

When M3 lands, add a CI check that fails if any file outside `lib/analytics/`
references `survey_events` or `event_agg_`:

```bash
git grep -lE "survey_events|event_agg_" -- 'app/**' 'lib/**' \
  | grep -v '^lib/analytics/' | grep -v '\.test\.' \
  && echo "Direct event-table access outside lib/analytics" && exit 1
```

Cheap to add and the only thing that stops the next feature under deadline
pressure from quietly reintroducing raw reads. Without it the contract erodes in
months.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Backfill finds slugs matching no campaign | Report and decide per case; never drop silently. This is the detachment bug the UUID key prevents going forward. |
| Dual-write doubles ingest cost | Measured before step 3; ingest is currently ~4 writes/second, so headroom is large. |
| Client clock skew in `ttfi_ms` | Reject implausible values at ingest, count rejects. |
| Historical `creative_id` unrecoverable | Accepted and permanent. Treated as "before attribution existed", which is why M1.0 ships first. |
| Cutover exposes an unaudited raw reader | §8's check runs before step 6, not after. |
