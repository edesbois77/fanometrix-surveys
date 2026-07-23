# Event Analytics Architecture

How Fanometrix stores, aggregates and serves survey event data, designed to hold
from today's ~1.1M events to hundreds of millions without a second rewrite.

Status: proposed. Nothing in this document is built yet. Migration 135 (composite
indexes on `survey_events`) is the last optimisation made to the raw table under
the old design.

---

## 1. The contract

"No rewrite in five years" is only achievable if we are precise about what is
permanent and what is replaceable. This design fixes four things and deliberately
leaves everything else free to change.

**Permanent, and expensive to change later:**

1. **Raw events are append-only and immutable.** No updates, no deletes except
   whole-partition retention drops. Every number the product shows is derivable
   from raw by replay.
2. **Every derived table is disposable.** Rollups can be dropped and recomputed
   from raw (or from archive) at any time, and recomputation is the normal repair
   mechanism, not an emergency one.
3. **The dashboard never reads `survey_events` directly.** It calls a query layer
   that decides which grain answers the question. This indirection is what allows
   the storage engine underneath to change without touching product code.
4. **Event identity is a UUID foreign key, never a slug.** See section 4.2.

**Replaceable without a rewrite, because of the above:**

- Which rollup tables exist, and at what grain.
- Rollup cadence, sealing lag, retention windows.
- The storage engine for raw events. Section 12 is explicit that Postgres is not
  the five-year answer for the raw tier at billions of events, and explains why
  that does not constitute a rewrite.

If a future change requires breaking one of the four permanent items, that is the
signal to stop and reconsider, not to proceed.

---

## 2. Today's reality, measured

Taken from production on 2026-07-23.

| Fact | Value |
|---|---|
| `survey_events` rows | 1,131,441 |
| Table size | 357MB total, 226MB heap |
| Average row width | 203 bytes |
| Average `campaign_id` slug length | 65 bytes |
| Date range | 2026-06-24 to 2026-07-22 (28 days) |
| Current ingest rate | ~440k renders/day and rising |
| Distinct campaigns in events | 27 |

Event type distribution, which drives every decision in this document:

| Event type | Count | Share |
|---|---|---|
| `SURVEY_RENDER` | 793,785 | 70.2% |
| `SURVEY_VISIBLE` | 335,289 | 29.6% |
| `SURVEY_START` | 683 | 0.06% |
| `QUESTION_2_REACHED` | 681 | 0.06% |
| `QUESTION_3_REACHED` | 339 | 0.03% |
| `SURVEY_COMPLETED` | 292 | 0.03% |
| `SURVEY_EXIT` | 253 | deprecated, no longer emitted |

**Two events are 99.8% of the volume, and they are pure counters.** Everything
below the top two rows is rare enough to treat as effectively free. This is the
single most important shape in the data and the design exploits it repeatedly.

### 2.1 Why indexing cannot fix this

After migration 135, the funnel count for one project runs as a textbook
index-only scan:

```
Parallel Index Only Scan using survey_events_campaign_type_created_idx
  Heap Fetches: 131          (visibility map working)
  Buffers: shared hit=11161  (fully cached, zero reads)
  rows=783,944
Execution Time: 6852ms
```

Nothing is misconfigured. The cost is ~8.7µs per index entry, and it scales
linearly with matched rows. At 784k rows that is 6.9s against an 8s API budget.
At the current growth rate it is ~17s within three days and ~2 minutes within a
month.

**Exact `COUNT(*)` over a growing event log is not an optimisation problem. It is
a modelling problem.** Counts must be precomputed and stored, which is what the
rest of this document specifies.

---

## 3. Architecture at a glance

```
  embed  ->  ingest  ->  survey_events        (raw, partitioned, 30d retention)
                              |
                              |  incremental, idempotent, jobs framework
                              v
                         event_agg_hourly      (full dimensions, 400d)
                              |
                              +--> event_agg_daily        (reduced dims, forever)
                              +--> survey_sessions        (started sessions only, forever)
                              |
                              v
                         query layer            (sealed rollups + live tail)
                              |
                              v
                         dashboard / reports / exports
```

Reads are served by summing precomputed buckets, never by scanning raw history.
The only raw read on the serving path is the current, unsealed hour, which is
bounded to roughly one hour of data regardless of how large the archive grows.

---

## 4. Layer 1: raw event storage

### 4.1 Partitioning

`survey_events` becomes `PARTITION BY RANGE (created_at)` with **daily**
partitions.

Rationale for daily rather than monthly or hourly: retention becomes an O(1)
`DROP TABLE` of one partition instead of a mass `DELETE` that bloats the heap and
never returns disk. At 30 days retention that is 30 live partitions, comfortably
inside the range where partition pruning stays cheap. Hourly partitions would
give 720 and start to cost planning time for no benefit.

Operational rules:

- Partitions are pre-created **14 days ahead** by a scheduled job. Ingest must
  never fail because tomorrow's partition does not exist.
- A `survey_events_default` catch-all partition exists as a safety net so a
  missed pre-creation degrades to "rows landed in the wrong place" rather than
  "collection stopped". A monitor alerts if it is ever non-empty.
- Partition maintenance runs through the jobs framework, not `pg_cron` directly
  and not `pg_partman`, so there remains exactly one scheduler in the system.
  The job invokes a Postgres function that performs the DDL.

### 4.2 Keys and columns

The current schema uses the human-readable campaign slug as the analytical key.
It is 65 bytes on average, mutable, semantically overloaded, and already lossy:
8 of 77 campaign slugs are truncated at exactly 80 characters, some mid-word
(`..._united_kingdom_livescor`, `..._united_kingdom_flashsco`). Two campaigns
differing only after character 80 would silently merge their funnels. There is no
foreign key, so a rename detaches history with no error.

New shape:

```sql
CREATE TABLE survey_events (
  campaign_uuid  uuid        NOT NULL REFERENCES campaigns(id),
  event_type     smallint    NOT NULL,   -- see 4.3
  session_id     uuid        NOT NULL,
  created_at     timestamptz NOT NULL,

  -- dimensions
  publisher_id   uuid,
  placement_id   uuid,
  creative_id    uuid,
  country        char(2),
  device         smallint,
  browser        smallint,

  -- measures, carried on the event (see 4.4)
  ttfi_ms        integer,    -- SURVEY_START only
  duration_ms    integer     -- SURVEY_COMPLETED only
) PARTITION BY RANGE (created_at);
```

- **No primary key.** Nothing in the codebase reads `survey_events.id`; verified
  across every reference. The existing random-UUID PK is the largest index on the
  table at 42MB, 32% of the index footprint, and scatters inserts across the whole
  index on an append-only workload. It is pure cost. A partitioned table's PK
  would also have to include `created_at`, making it wider still.
- **Slug lives only on `campaigns`.** Resolve it at query time by joining 77 rows.
  Never denormalise it back onto the fact table.
- Dimension columns become FKs or small enums rather than free text. `country` as
  `char(2)` and `device`/`browser` as `smallint` lookups removes tens of bytes per
  row at zero analytical cost.

Estimated row width after the change: roughly 70 to 80 bytes against today's 203.
That is a 60% reduction in the raw tier before any rollup exists.

### 4.3 Event type as a versioned enum

`SURVEY_EXIT` still has 253 rows from before it was retired. The taxonomy will
change again. Store `event_type` as `smallint` against a lookup table
(`event_types(id, code, description, retired_at)`) so retiring a type is a
metadata change, not a data migration, and historical rows stay interpretable.

### 4.4 Measures on the event, not derived by joining

Today, time-to-first-interaction is computed by loading `SURVEY_VISIBLE` and
`SURVEY_START` rows for the same session and subtracting, in JavaScript, paging
1000 rows at a time ([lib/survey-timing.ts](../lib/survey-timing.ts)). That does
not survive scale, and it does not need to exist.

The browser already knows both timestamps. Have the embed send `ttfi_ms` as a
field on the `SURVEY_START` event, and `duration_ms` on `SURVEY_COMPLETED`.

Consequences, all good:

- Timing metrics become **additive aggregates** (`sum`, `count`), which means they
  roll up exactly like counts and need no session join at any layer.
- `SURVEY_VISIBLE` becomes a pure counter with no downstream dependency, so it can
  be aggregated aggressively and retained briefly.
- Distribution is preserved properly: store fixed **log-scale histogram buckets**
  in the rollup (`ttfi_bucket_0`..`ttfi_bucket_n`) so p50 and p95 are computable
  from the rollup. Averages alone hide the shape, and percentiles are not
  additive, but bucket counts are.

Clock skew is the one risk of client-supplied durations. Mitigate by rejecting
negative and implausible values at ingest (`0 <= ttfi_ms <= 30 minutes`) and
recording rejects to a counter so silent data loss is visible.

---

## 5. Layer 2: the rollup grain ladder

The failure mode to avoid is a single wide rollup at full dimensionality, which at
scale becomes as expensive as the raw table it replaced. The answer is a small
number of purpose-built grains, with the query layer choosing between them.

### 5.1 `event_agg_hourly`

```sql
CREATE TABLE event_agg_hourly (
  bucket_hour    timestamptz NOT NULL,   -- truncated to the hour, UTC
  campaign_uuid  uuid        NOT NULL,
  event_type     smallint    NOT NULL,
  publisher_id   uuid,
  placement_id   uuid,
  country        char(2),
  device         smallint,
  browser        smallint,

  event_count    bigint      NOT NULL,
  ttfi_sum_ms    bigint,
  ttfi_count     bigint,
  ttfi_buckets   integer[],              -- log-scale histogram
  duration_sum_ms bigint,
  duration_count  bigint,
  duration_buckets integer[],

  PRIMARY KEY (bucket_hour, campaign_uuid, event_type, publisher_id,
               placement_id, country, device, browser)
) PARTITION BY RANGE (bucket_hour);
```

Cardinality is bounded by **observed** combinations, not the cartesian product. A
campaign runs on one publisher in one market, so realistic spread is device (3) x
browser (5) x placement (2), roughly 30 rows per campaign-hour-eventtype, and only
for the two high-volume types. At 22 live campaigns that is on the order of 1,500
to 2,000 rows per hour, roughly 15M per year. Retained 400 days.

Compression against raw at today's rates: ~18,000 raw events per hour collapse to
~1,800 rollup rows, and each rollup row is narrower. Roughly 20x on rows and more
on bytes, and the ratio *improves* as traffic grows, because more traffic means
more events per bucket, not more buckets.

### 5.2 `event_agg_daily`

Same shape, `bucket_day`, with `browser` and `placement_id` dropped. Long-range
analysis does not need browser breakdowns, and dropping two dimensions collapses
cardinality by roughly an order of magnitude. Retained **forever**. This is the
table that answers "the whole of last year" in milliseconds.

### 5.3 `survey_sessions`

One row per session **that reached `SURVEY_START`**, holding the session's
timestamps, dimensions and outcome.

The selectivity of the funnel makes this nearly free: 683 started sessions across
all history, against 794k renders. Even at 100x today's traffic this table stays
small enough to query directly, and it is what serves per-session research
questions that no aggregate can answer, such as "which creatives produced
completions in Germany last week".

Sessions that only ever rendered are represented in the counters and nowhere else,
which is correct: there is nothing to say about them individually.

### 5.4 Why not materialized views

Postgres materialized views refresh wholesale, cannot be incrementally updated
without extensions, and lock on refresh. Explicit tables written by an idempotent
job give incremental updates, partial recomputation, per-bucket auditing, and
survive the eventual move of raw storage elsewhere. The extra code is worth it.

---

## 6. Layer 3: the incremental pipeline

Runs on the existing jobs framework ([lib/jobs](../lib/jobs)), which already owns
claiming, leasing, retries, backoff and recovery. No bespoke scheduling.

### 6.1 Job types

| Job type | Cadence | Responsibility |
|---|---|---|
| `event_rollup_hourly` | every 5 min | Seal and refresh recent hourly buckets |
| `event_rollup_daily` | hourly | Recompute yesterday and today's daily buckets from hourly |
| `event_sessionize` | every 5 min | Upsert started sessions |
| `event_partition_maintain` | daily | Pre-create partitions, drop expired, archive |
| `event_rollup_reconcile` | daily | Verify rollups against raw, alert on drift |

Each uses `dedupeKey` so a double trigger cannot create duplicate work, which the
framework already enforces with a partial unique index.

### 6.2 The late-arrival problem, and why watermarks alone are wrong

The obvious design, "process everything with `created_at` greater than the last
watermark", is subtly broken. A row can carry `created_at = T` but only become
visible to a reader after the watermark has advanced past `T`, because the
inserting transaction had not committed yet. Those rows are then never counted.
This undercounts silently and is very hard to detect after the fact.

Two mechanisms, used together:

1. **Sealing lag.** An hour is only sealed once it is at least 15 minutes in the
   past. Longer than any plausible ingest transaction.
2. **Trailing recomputation.** Every run recomputes the last 3 hours in full and
   replaces those buckets. Combined with the daily job recomputing the whole of
   yesterday, any straggler is absorbed within a day, automatically.

This is what makes the pipeline self-healing, and it is only possible because
rollups are disposable by design (contract item 2).

### 6.3 Idempotency

Buckets are **replaced, never incremented**:

```sql
INSERT INTO event_agg_hourly (...)
SELECT ... FROM survey_events WHERE created_at >= $1 AND created_at < $2 GROUP BY ...
ON CONFLICT (bucket_hour, campaign_uuid, event_type, publisher_id,
             placement_id, country, device, browser)
DO UPDATE SET event_count = EXCLUDED.event_count, ...;
```

Incrementing (`count = count + n`) is not idempotent: a retry after a partial
failure double-counts. Full replacement of a whole bucket means running the job
twice produces the same answer as running it once, which is the property the jobs
framework's retry semantics require.

Extraction reads raw **one campaign at a time** rather than with a large `IN`
list. Measured on production, a single-campaign equality scan costs ~1.3µs per row
against ~8.7µs for a 22-element array scan, a 6.7x difference on the same index.

### 6.4 Watermarks and auditing

```sql
CREATE TABLE rollup_watermark (
  rollup_name   text PRIMARY KEY,
  sealed_through timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rollup_runs (
  id serial PRIMARY KEY,
  rollup_name text, bucket_from timestamptz, bucket_to timestamptz,
  rows_read bigint, rows_written bigint, duration_ms integer,
  ran_at timestamptz DEFAULT now()
);
```

`sealed_through` is what the query layer reads to split sealed history from the
live tail. `rollup_runs` is how we answer "why did that number change".

---

## 7. Layer 4: the query layer

A single module, `lib/analytics/`, is the only thing in the codebase permitted to
know where numbers come from. Everything else, dashboards, reports, CSV export,
the metric registry, calls it.

```ts
getFunnelCounts({ campaignIds, filters, from, to }): Promise<FunnelCounts>
getEventSeries({ campaignIds, filters, from, to, grain }): Promise<Series>
getTimingStats({ campaignIds, filters, from, to }): Promise<TimingStats>
```

### 7.1 Grain selection

1. If the range exceeds 60 days, or uses no dimension beyond campaign and country,
   read `event_agg_daily`.
2. Otherwise read `event_agg_hourly`.
3. Never read raw for sealed history.

### 7.2 The live tail

This is what makes the dashboard real-time without expensive counting:

```
result = sum(rollup rows where bucket < sealed_through)
       + count(raw events where created_at >= sealed_through)
```

The raw portion is bounded to roughly the sealing lag plus one bucket, so at most
a couple of hours of data, currently around 40k rows and answered in a few hundred
milliseconds by `survey_events_campaign_type_created_idx`. That bound does not
grow with the size of the archive. **This is why migration 135's composite index is
permanent rather than transitional.**

### 7.3 One round trip

The whole funnel, all event types, sealed plus live, is one Postgres function
returning one row set. Today's dashboard issues six separate exact counts plus a
paginated series query per load. That becomes one call.

### 7.4 Approximation is a product decision, not a technical one

Impression counts do not need to be exact to the unit, but research figures do. The
design keeps everything exact because rollups make exactness cheap. If a future
metric genuinely needs sub-second answers over billions of rows with tolerance for
error, HyperLogLog sketches stored in the rollup are the extension point. Not
needed now, and noted so nobody reaches for approximation prematurely.

---

## 8. Layer 5: retention and archival

| Tier | Retention | Rationale |
|---|---|---|
| `survey_events` raw | **30 days** hot | Enough to recompute any rollup and to debug. |
| Archived raw | Indefinite, object storage | Parquet in Supabase Storage or S3. |
| `event_agg_hourly` | 400 days | Year-on-year comparison with full dimensions. |
| `event_agg_daily` | Forever | Small enough that retention is pointless. |
| `survey_sessions` | Forever | Tiny and research-critical. |

Sizing the raw tier: at 203 bytes/row today, 30 days is ~2.7GB. After the row-width
reduction in 4.2, closer to 1GB. At 10x traffic, ~10GB, which is a compute-tier
decision rather than a design change.

Archival runs as part of `event_partition_maintain`: a partition older than the
retention window is exported to Parquet, verified by row count, then dropped. That
preserves "append-only forever" without paying Postgres prices for cold data, and
it keeps replay possible, which is what contract item 2 depends on.

---

## 9. The ingest path

Currently every ad load posts a single-row insert straight to PostgREST from the
browser ([app/embed/ThemedSurvey.tsx](../app/embed/ThemedSurvey.tsx)). At 4 inserts
per second this is fine. It is the part of the system that breaks first as traffic
grows, well before storage does, because it has no batching, no backpressure and no
buffer if the database is briefly unavailable.

Evolution, in order of when it becomes necessary:

1. **Now:** ingest resolves and writes `campaign_uuid`. The embed already fetches
   CDN-cached campaign config, so put the UUID in that payload and there is no
   per-event lookup.
2. **Now:** client sends `ttfi_ms` and `duration_ms` as measures (section 4.4).
3. **~10x traffic:** batch within a session. Buffer events client-side and flush on
   an interval and on `visibilitychange` with `sendBeacon`. Roughly halves requests
   at current event mix.
4. **~100x traffic:** an ingest buffer. Events land in a queue or an unindexed
   staging table and are moved into partitions in batches by a job. This decouples
   ad delivery from database availability, which matters more than throughput: a
   database blip should never cost impressions.

Item 4 is where the architecture stops being a Postgres-only design, and is the
natural point to reconsider section 12.

---

## 10. Correctness and trust

Numbers nobody trusts are worse than no numbers. Three mechanisms:

- **Reconciliation job**, daily. For a sample of sealed buckets, compare the rollup
  sum against a direct count of raw (possible only while raw is still hot, which is
  one of the reasons for a 30-day window). Any drift raises an alert and records to
  `rollup_runs`.
- **Replay as repair.** Fixing a bad bucket means deleting it and re-running the
  job for that window. There is no manual correction path, by design.
- **Metric definitions stay canonical.** [lib/metrics](../lib/metrics) remains the
  single source of truth for what each number means; this document only changes
  where it is computed. `dataSource` strings in the registry get updated to name
  the rollup rather than the raw table.

---

## 11. Migration plan

Five phases, each independently shippable and individually revertible. Ordered so
the cheapest-now work happens first, because every one of these gets more expensive
as rows accumulate.

### M1: reshape raw storage
Partitioning, `campaign_uuid`, narrow dimensions, drop the PK, event type enum,
measure columns. Create `survey_events_v2`, dual-write from ingest, backfill,
verify counts match, cut reads over, drop the old table.

At 1.13M rows the backfill is minutes. At 100M it is a maintenance window. **This
phase should happen within weeks, not months.** It is the only phase whose cost
grows super-linearly with delay.

Also covers `responses`, which carries the same slug key. Events are recoverable in
aggregate; a response whose campaign attribution silently detaches is corrupted
research evidence, so it matters more.

### M2: rollup tables and pipeline
Create the aggregate tables, implement the five job types, backfill history from
raw, run in parallel with existing queries without serving them. Verify with the
reconciliation job before anything depends on it.

### M3: query layer
Build `lib/analytics/`, migrate the dashboard, reports and CSV export onto it,
delete every direct `survey_events` read from product code. This is the phase that
makes contract item 3 real.

### M4: retention and archival
Enable partition drops and Parquet export. Only safe once M2 is verified, because
dropping raw before rollups are trusted is irreversible.

### M5: ingest evolution
Batching and buffering, per section 9. Driven by traffic, not by schedule.

---

## 12. Scale ceilings, honestly

This design on a single Postgres instance comfortably serves:

- **Ingest:** to roughly 5,000 to 10,000 events/second with batched writes (M5),
  which is around 400M to 800M events/day.
- **Serving:** effectively unbounded, because reads touch rollups whose size grows
  with campaign-hours, not with events.
- **Raw retention:** 30 days at whatever the compute tier's disk allows.

Where it stops: sustained ingest beyond ~10k events/second, or a requirement to
keep years of raw events queryable rather than archived. At that point the raw tier
moves to a columnar store (ClickHouse, BigQuery, Timescale) and the rollup pipeline
reads from there instead.

**That is not a rewrite, and the distinction matters.** The dashboard, the metric
registry, the rollup semantics, the query layer's interface and every product
surface are unchanged, because they were never coupled to raw storage. One job
handler changes where it reads from. That outcome is the entire purpose of contract
items 1 to 3, and it is the honest meaning of "no architectural rewrite": the
contract survives, the engine may be replaced.

Promising that Postgres alone will serve billions of raw events with sub-second
analytics would be untrue, and designing as if it were would produce a worse system
than designing for the swap.

---

## 13. Decisions

### Resolved (2026-07-23)

1. **Raw retention: 30 days by default.** Revisit if a client contract requires
   longer. Archived partitions remain replayable, so lengthening retention later
   costs restore time, not lost data.
2. **`creative_id` is a first-class column**, not something encoded into campaign
   slugs. It becomes a rollup dimension and the basis for per-creative performance,
   which is currently not attributable. See [M1 plan](m1-migration-plan.md) §4 for
   how historical rows are handled.
3. **No production code reads `survey_events` directly.** All reads go through the
   aggregate query layer. Enforced mechanically, not by convention: see
   [M1 plan](m1-migration-plan.md) §8.

### Still open

4. **Archive destination.** Supabase Storage keeps everything in one vendor; S3 is
   cheaper and more standard. Affects M4, not M1.
5. **Sealing lag of 15 minutes.** Should be validated against observed ingest
   transaction durations rather than assumed. Affects M2.
