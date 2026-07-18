# Fanometrix — Evidence Lifecycle (Conversation Intelligence)

> **Status:** Agreed / canonical for Conversation Intelligence. **Implementation
> pending.** This is the reference we build against. It extends the Research
> Engine constitution (`docs/research-engine-architecture.md`) *below the evidence
> line* — it changes how an evidence producer accumulates evidence, and changes
> nothing in the Research Question → Evidence → Aspect → Finding → Report model.
> When built, it **supersedes the snapshot-per-run model** described in
> `supabase-migration-112.sql`.

---

## 1. The one idea

A Conversation Search owns **one growing, append-only evidence base**. Collection
runs do not re-import evidence — they record **events about evidence**. The
mistake in the previous model was that each run stored *copies* of evidence; here
each run stores *what it encountered*.

Three cooperating parts, no duplication:

```
Evidence Base     one row per unique item        (the "what")
Collection History one ledger entry per run       (the "when/what changed")
Observations      one row per (item seen in run)  (the "provenance")
```

Because every encounter is an observation, the full set a run saw is
reconstructable (all items observed in that run) — so we keep complete run
snapshots **and** a single deduplicated base at the same time.

---

## 2. Identity

Evidence identity is **`(search_id, connector, external_id)`** — search-scoped,
so two Conversation Searches may independently hold the same item, and it exists
exactly once *within* a search. `external_id` is the connector's native id:

| Connector | `external_id` | Notes |
|---|---|---|
| YouTube | video id / comment id | comment `parent_external_id` = video id |
| Reddit | fullname (`t3_…` post, `t1_…` comment) | flat |
| News (future) | canonical URL / GUID | — |

Each connector declares its identity as a capability; the base and the diff logic
never hard-code connector specifics.

---

## 3. The evidence base — append-only

One row per unique item. It is written **once** and never duplicated. It carries:

- `first_seen_at`, `first_seen_run_id`
- `last_seen_at`, `last_seen_run_id`
- its classification (relevance, confidence, why-this-matters, research aspect,
  sentiment, topic, entities) — assigned once, at first import (see §9 for the
  evolving-question caveat).

An item is **never re-imported and its text is immutable.** The only in-place
change permitted is a refresh of mutable *metadata/metrics* (§6, "updated").

---

## 4. Collection History — the event ledger

Every `Run Collection` is one ledger entry (`collection_runs`), recording the
scope used and four counts:

- **New conversations added** — items whose identity was not in the base.
- **Existing conversations updated (where supported)** — already-stored items the
  connector re-observed with changed refreshable metadata (e.g. a video's
  view/comment count), refreshed **in place**, never duplicated.
- **Duplicates ignored** — already-stored items re-seen with nothing new.
- **Total evidence after the run** — the cumulative unique base size.

The ledger references evidence; it never copies it. History is complete and
timestamped regardless of how the base changed.

---

## 5. Observations — provenance without duplication

One append-only row per **encounter**: `(mention_id, collection_run_id,
search_id, observed_at)` — unique on `(mention_id, collection_run_id)`. Optional
`snapshot` (jsonb) may later hold the item's metrics at that moment for
metric-over-time.

This single ledger gives:

- **First seen / last seen** — min/max `observed_at` for an item.
- **Seen in Run 1, 2, 4…** — an item's full encounter history.
- **Exact run deltas** — a run's new items are its observations whose
  `mention.first_seen_run_id == run`; re-seen items are the rest. The §4 counts
  are derived from here (and may be denormalised onto the run for fast display).
- **Reproducibility** — the full set a run observed = all items observed in that
  run. Per-run snapshots are recovered **from the base**, never re-stored.
- **Foundations for later** — freshness (last seen), recurrence/trend signals
  (encounter frequency over time).

---

## 6. A run imports only the delta

`Run Collection`:

1. Retrieve everything matching the **current** scope.
2. Diff against the base by identity.
3. **Import + classify only genuinely new items** — AI relevance is paid **once
   per item**, never once per run.
4. For already-stored items: refresh mutable metrics in place *where the connector
   supports it* (counts as "updated"); otherwise ignore (counts as "duplicate").
5. Record an **observation** for every item encountered — new *and* re-seen.
6. Write the ledger entry (four counts) and update the base's `last_seen`.

Scope expansion (e.g. adding a market) is naturally additive: newly-matching
items are new; items already in the base are not re-added.

---

## 7. Containers immutable, children append

An existing video/post/thread is neither re-imported nor mutated. Its
genuinely-new child conversations (new comments) are **appended** and attached via
`parent_external_id`, and counted under "new added" — not as an "update" to the
parent. ("Updated" is metadata-only, §6.) This requires connectors to support
**"collect since last seen"** for children rather than "top-N by relevance" — a
connector capability to add during implementation.

---

## 8. One cumulative total, everywhere

Dashboard, the Evidence view, and the run ledger all read the same deduplicated
base. Once storage is append-only, cross-run duplicates do not exist, so read
paths **simplify** — no read-time dedup, no double-counting. "Total evidence" has
exactly one meaning.

---

## 9. Synthesis staleness — never silent regeneration

Synthesis (aspect synthesis, findings) is **never regenerated automatically.**
Each synthesis records the **evidence watermark** it was built from. When the base
grows past that watermark, the synthesis is flagged **Out of date — "N new
conversations since last update,"** prompting the researcher to update it (same
shape as the project's existing `report_stale`).

- Staleness triggers on **new evidence added to the base**, not on run count — a
  run that adds 0 new items does **not** mark synthesis out of date.

**Noted follow-up (non-blocking):** relevance and research aspect are judged
against the research question *at import time*. If the question or scope is later
edited, older evidence keeps its original judgment. Evidence stays append-only; a
separate **"re-assess evidence"** action (re-classify without re-importing) is a
conscious later decision and does not change anything above.

---

## 10. Data model sketch (for implementation, not yet built)

- **`social_mentions`** (base): unique index moves from `(collection_run_id,
  connector, external_id)` → **`(search_id, connector, external_id)`**; add
  `first_seen_at/​run_id`, `last_seen_at/​run_id` (the existing
  `collection_run_id` becomes `first_seen_run_id`).
- **`collection_runs`** (ledger): record `new_count`, `updated_count`,
  `duplicate_count`, `total_after` (in `stats` or dedicated columns).
- **`evidence_observations`** (new): `(id, mention_id, collection_run_id,
  search_id, observed_at, snapshot?)`, unique `(mention_id, collection_run_id)`,
  append-only.
- **Data migration:** existing cross-run duplicates are collapsed to one base row
  per identity (keep earliest as `first_seen`, latest as `last_seen`), and an
  observation is back-filled from each existing row's `collection_run_id` — so no
  provenance is lost in the transition.

Suggested phasing: (1) base dedup + observations + ledger counts; (2) connector
"since last seen" for children; (3) synthesis watermark + Out-of-date flag.

---

## 11. Invariants (the measuring stick)

1. An evidence item exists **once** per Conversation Search; it is never
   re-imported and its text is immutable.
2. Runs record **events**, never copies; Collection History is a complete ledger.
3. Provenance lives in **observations**, never by duplicating evidence.
4. AI relevance is assessed **once per item**.
5. "Total evidence" has a single, deduplicated definition everywhere.
6. Synthesis never auto-regenerates; new evidence marks it **Out of date**.

---

*The test for anything in this layer: "Does it change how a Conversation Search
accumulates evidence, without duplicating evidence, and without touching the
Research Question → Evidence → Finding model?" If it duplicates evidence or leaks
above the evidence line, it does not belong here.*
