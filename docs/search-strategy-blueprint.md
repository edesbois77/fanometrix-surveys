# Fanometrix — Search Strategy Blueprint

> **Status:** Proposed. Blueprint for a future release, not active work. This
> document captures the agreed direction for improving retrieval quality in
> Conversation Intelligence. It extends — and must stay consistent with — the
> Research Engine constitution (`docs/research-engine-architecture.md`). No code
> here; when we build it, this is the intent.

---

## 1. The problem

Today the flow is essentially:

```
Research Question → Keywords → Collect conversations → AI judges relevance
```

Every connector searches the same flat keyword list, so a question like *"How do
football fans perceive FedEx's UEFA Champions League sponsorship?"* with the
keyword `FedEx` retrieves the sponsorship discussion **and** logistics news,
delivery complaints, and unrelated "FedEx driver" videos. The AI relevance stage
(retrieve-and-judge) correctly discards the noise, but we still pay to retrieve,
store, and classify large amounts of evidence that never had a chance of being
relevant.

**There is a missing layer between the Research Question and the connector
queries: a retrieval plan.**

---

## 2. The one idea

Retrieval is a **compile step**, not a keyword list:

```
Research Question          (intent, natural language — what the researcher writes)
        ↓  derived by an AI strategist
Search Strategy            (a structured, generated, human-editable retrieval spec)
        ↓  compiled per connector, at collect time
Connector Queries          (each connector's native query — never stored)
        ↓
Evidence Collection
        ↓
AI Relevance Assessment    (unchanged — the quality net)
        ↓
Research Aspect → Finding → Report
```

The **Search Strategy** is the compiled intent of a Research Question for one
evidence producer. It replaces the flat keyword list as the source of truth for
*what to search*; each connector translates it into the most appropriate query
for its own API.

---

## 3. Where it sits in the model

The Search Strategy is **not** a new first-class object in the research model. It
lives entirely **inside the Evidence-Source boundary** of the constitution:

```
Research Question (root / child)
   └── Evidence Source: Conversation Search
          { research question, SEARCH STRATEGY, connectors }
              → connector queries (compiled) → Evidence
                   → Research Aspect → Finding → Report
```

It passes every test in the constitution's anti-pattern list: Findings never
cite a strategy, Reports never cut at a strategy, evidence binds to the *search*
(not the strategy), and it is 1:1 with a Conversation Search. It is fully
derived and regenerable — the same class of thing as the AI classification and
the aspect synthesis we already store as structured content.

**Decision:** model it as a structured `search_strategy` (jsonb) attribute on the
Conversation Search (`social_searches`), generated from the question, editable,
versioned-by-regeneration. `social_keywords` becomes an *input signal* to the
strategist rather than the retrieval source of truth.

**When this would flip to a first-class object:** only if strategies needed to be
shared across searches/sources, or maintained as a reusable library. That is
speculative today and would violate "one search = one question." The jsonb shape
should be designed cleanly so promoting it later is cheap — but we do not pay for
that now.

---

## 4. The Search Strategy shape

Deliberately **connector-agnostic** — it stores intent and hints, never compiled
per-connector query strings (those are brittle and leak connector logic into
stored data).

```
SearchStrategy {
  primary_entity:   { term, type, aliases[] }         // FedEx (Brand)
  context_entities: [ { term, type, aliases[] } ]     // UEFA Champions League (Competition,
                                                      //   aliases: UCL, Champions League),
                                                      //   football (Topic), sponsorship (Topic)
  campaigns:        string[]                           // named activations
  synonyms:         string[]                           // recall expansion
  exclusions:       string[]                           // disambiguation: logistics, parcel, tracking…
  breadth:          "broad" | "balanced" | "strict"    // the precision dial (§6)
  languages:        string[]
  markets:          string[]
  connector_overrides: { <connectorId>: { … } }        // hints only, e.g. Reddit subreddits
  generated_at, edited
}
```

---

## 5. Deriving the strategy from the question

A **Search Strategist** — a config-time AI analyst, sibling of the
collection-time relevance classifier and the aspect-synthesis analyst. One call
when the question is written or edited.

- **Input:** the research question, any terms the researcher typed,
  `entity_type` / `research_goal`, markets.
- **Output:** the structured strategy above — doing the query-understanding work
  researchers should not: entity extraction, **disambiguation** (FedEx-the-sponsor
  vs FedEx-the-logistics-company), synonym/alias generation, per-market language
  suggestion.

The researcher then reviews and edits (§7). A **Regenerate** action re-derives
from the question while preserving manual edits.

---

## 6. Precision without over-restriction

The dominant lever is **anchoring by co-occurrence**, not more keywords:

1. **Anchoring** — retrieve where *primary entity AND ≥1 context anchor* co-occur
   (`FedEx AND (Champions League | UCL | football | sponsorship)`). This alone
   removes the logistics/delivery/pool noise, because those items carry no
   football context.
2. **Disambiguation exclusions** — a secondary, *conservative* tool (`-logistics
   -parcel`). Exclusions are the sharp edge: an over-eager `-delivery` could drop
   "FedEx delivered a great matchday." Lead with positive anchoring; use
   exclusions sparingly and only researcher-confirmed.
3. **Phrase precision** where the connector supports it (`"Champions League"`).
4. **Query fan-out + merge** for weak-boolean connectors — several targeted
   queries unioned beats one loose query.

Two guards against over-restriction:

- **A breadth dial, not a rewrite:** Broad (primary only) ↔ Balanced (primary +
  any context) ↔ Strict (primary + specific phrases). Default Balanced. The
  retrieval twin of the relevance-threshold slider.
- **The retrieval unit matters.** For comment-based sources (e.g. YouTube), the
  strategy anchors the *container* (the video); its comments come along
  regardless of whether each restates "FedEx." Anchoring the container is
  high-precision **and** preserves comment recall — context lives at the
  container, conversations inherit it.

**Keep the AI relevance stage as the net.** Retrieval precision reduces volume,
cost, and quota; relevance guarantees quality. They are complementary — never
over-tighten retrieval to compensate for the classifier, because coarse connector
boolean will silently drop good evidence.

**The compounding idea (the moat):** close the loop. After a run, the relevance
results *diagnose the strategy* — "63% of retrieved FedEx items were logistics;
suggest adding exclusion `parcel`" — turning retrieve-and-judge into a **learning
retrieval system**. This is the differentiated position versus tools that stop at
retrieval.

---

## 7. Inspecting and editing — no query syntax

Researchers edit **plain-language structured cards**, never boolean:

- **Primary subject:** FedEx
- **In the context of:** `UEFA Champions League` `Champions League` `football`
  `sponsorship` (addable / removable chips)
- **Excluding:** `logistics` `parcel` `driver` (each one click to remove — the
  risky field)
- **Breadth:** Broad · **Balanced** · Strict (with a one-line plain description)
- **Markets / Languages:** existing controls

Below, a read-only **"What Fanometrix will search"** panel, rendered in human
terms per connector (*"On YouTube: videos about FedEx that also mention the
Champions League, football or sponsorship, excluding logistics"*), driven by the
pure `compileQuery` function (§8). Power users get an optional "view raw query"
disclosure; everyone else never sees `AND/OR/NOT`.

---

## 8. How connectors consume one strategy

Add a **pure** `compileQuery(strategy, capabilities) → native query/queries` to
the `Connector` interface, alongside `collect()`. The strategy is source-agnostic;
**compilation is connector-owned.** Extend `ConnectorCapabilities` with query
traits (`supportsBoolean`, `supportsExclusion`, `supportsPhrase`, `isTopicBased`,
`maxQueryLength`) so each compiler degrades gracefully.

The same strategy compiles very differently — which is exactly why compilation
must be per-connector and why compiled queries must never be stored:

| Connector | Compiles to |
|---|---|
| **YouTube** (`q` supports `-`, `\|`, quotes) | `"FedEx" ("Champions League"\|UCL\|football\|sponsorship) -logistics -parcel`, possibly fanned into a few queries and merged |
| **Reddit** (full boolean + subreddits) | `FedEx AND ("Champions League" OR UCL OR sponsorship) NOT (parcel OR tracking)`, scoped to suggested subreddits |
| **News** | quoted phrase pairs — `"FedEx" "Champions League"`, `"FedEx sponsorship"` |
| **Google Trends** (topic-based, no boolean) | **primary entity only**; context becomes comparison terms, not filters |

Making `compileQuery` pure (no I/O) is deliberate: it is unit-testable *and*
powers the §7 preview without hitting any API.

**Provenance:** `collection_runs.config` already snapshots per-run config for
reproducibility — include the compiled strategy there, so every run stays
independently reproducible with no new history table.

---

## 9. Phased implementation

Each phase is independently valuable and backward-compatible (keyword fallback
until superseded).

1. **Strategy + Strategist + editor UI** — generated from the question, with the
   structured plain-language editor and the human-readable preview. Strategy
   still flattens to terms; no connector changes yet.
2. **`compileQuery` + query capabilities** on connectors; `run-collection` uses
   the strategy when present, else legacy keywords. Add anchoring and the breadth
   dial.
3. **The feedback loop** — post-run strategy diagnostics derived from the
   relevance results (suggested exclusions, noisy anchors).

---

## 10. Invariants (the measuring stick)

1. The Search Strategy is retrieval config for one evidence producer — **never** a
   node in the Research Question tree, and never referenced by Findings or Reports.
2. The strategy is **connector-agnostic**; compiled queries are per-connector and
   **never stored**.
3. Retrieval precision reduces cost and noise; **AI relevance remains the quality
   arbiter.** Neither replaces the other.
4. Positive anchoring is preferred over exclusion; exclusions are conservative and
   researcher-confirmed.
5. Researchers author a **research question**, and edit strategy in **plain
   language** — never boolean syntax.
6. Every run stays independently reproducible via the `collection_runs` snapshot.

---

*The test for any addition here: "Does it help a Research Question retrieve
better candidate evidence, without becoming a new organising concept or exposing
query syntax to the researcher?" If not, it does not belong in this layer.*
