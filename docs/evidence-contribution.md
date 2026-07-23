# Evidence Contribution

**Status: design only. Nothing in this document is implemented.**

A platform-level methodology defining what each evidence source can legitimately
contribute to a research requirement, so relevance is judged against the source's
own contract rather than against an assumption that every source answers
fan-perception questions.

---

## 1. The problem, precisely

Measured on the FedEx project, 2026-07-23. The European Sponsorship Association
published three case studies of FedEx's own UEFA Champions League activation:

> *"FedEx, an official sponsor of the UEFA Champions League, teamed up with
> European football legend Andrés Iniesta to surprise and delight fans at the
> UEFA Champions Festival in Olympiapark München…"*

All three were acquired correctly, landed in window, reached the classifier —
and scored **0%, Off-topic**. The classifier's stated reason:

> *"does not provide any direct evidence of fan perceptions or reactions."*

It was right. The requirement it was judged against is *"Understand current fan
perceptions of FedEx's involvement"*, and its information needs are all
fan-perception questions. The news safeguards **correctly** forbid an article
from asserting what fans think. So two individually correct rules collided, and
the result is a dead end: **News can never be relevant to a fan-perception
requirement, however on-point the coverage.**

Restating only the *needs* as what News can contribute — what the sponsorship
did, how it was portrayed — moved the same three articles to **80% / 60% / 60%**
with every safeguard still holding (`brand_announcement`, `attributed_claim`,
`fan_evidence: none`).

**This is not a News bug.** The same assumption is wired into all three
classification paths:

| Path | Used by | Assumption |
|---|---|---|
| `buildClassificationPrompt` | Conversation | judges against the requirement's needs |
| `buildNewsClassificationPrompt` | News | judges against the requirement's needs |
| `aspect-classify.ts` | Survey, Research Library | judges "does this help answer the research question" with no source model at all |

A best-practice document or a survey statistic is exposed to exactly the same
failure. **Only the requirement side of the model exists.** The source side is
missing.

### The mechanism, exactly

The platform already has `MethodFit` (`primary | supporting | conditional |
not_suitable`) — a per-method verdict recorded on every `MethodRecommendation`.
It is then discarded at precisely the wrong seam:

- `flattenNeeds()` returns `{ aspect, need }` only — `method_fit` is dropped.
- Both generators (`generate-searches-from-design.ts:55`,
  `generate-news-tasks-from-design.ts:51`) **hardcode `method_fit: "primary"`**
  when building the needs a task carries.

So the design carefully reasons about what each method can do, and then every
source is handed the same undifferentiated list as if it were the primary method
for all of it. Evidence Contribution is not a new parallel concept — it is the
**missing source-side half of a model whose requirement-side half already
exists**.

---

## 2. The three axes

Two axes exist. The third is what this document adds.

| Axis | Question | Values | Status |
|---|---|---|---|
| **Evidence Role** | *Why* are we collecting this? | direct · comparative · strategic | Built (`lib/evidence-role.ts`) |
| **Method Fit** | *How suitable* is this method here? | primary · supporting · conditional · not_suitable | Built, but discarded before classification |
| **Evidence Contribution** | ***What kind of knowledge* can this source produce?** | see §3 | **Proposed** |

They are orthogonal and all three are needed. A News task can be *direct* (about
the client), *supporting* (not the primary method), and contribute *factual
record and media framing* (not fan perception) — all at once. Today only the
first is carried into classification.

---

## 3. Contribution kinds — the smallest useful vocabulary

A source-independent vocabulary. Sources declare which kinds they can supply;
requirements declare which kinds they need. Deliberately about **the nature of
the knowledge**, never about the technology producing it, so a future source
picks from this list rather than inventing its own language.

An earlier draft of this document proposed twelve kinds. That was too many, and
the reduction is not cosmetic — the test applied was: **does this kind carry a
prohibition no other kind carries?** A kind that cannot be misread in its own
distinctive way is not earning its place, because the prohibitions are the whole
point. Six survive.

| Kind | What it establishes | Cannot establish |
|---|---|---|
| `elicited_perception` | What people say when asked: attitudes, associations, motivations, stated intent | What they actually did, or will do |
| `unprompted_discourse` | What people say unbidden, in their own words, and which themes are rising or fading | Population magnitude, or what the silent majority thinks |
| `documented_activity` | What verifiably happened: activity, deals, chronology, and how it was reported | What audiences thought of it, or whether it worked |
| `interested_claim` | What a party with a stake says about itself or its own work | That the claim is true |
| `expert_judgement` | A named professional's assessment | Consensus, or audience opinion |
| `established_knowledge` | Prior research, best practice, benchmarks, market structure | That it holds for this engagement |

### What was collapsed, and why it is safe

- `fan_perception` + `stated_behaviour` + `intent` → **`elicited_perception`**.
  Methodologically distinct, but they share one source (Survey) and one
  prohibition (*self-reported, not observed*). The distinction between an
  attitude and a stated intent is real and belongs in the survey instrument, not
  in a cross-source contract.
- `public_discourse` + `emerging_theme` → **`unprompted_discourse`**. Salience
  over time is a property of discourse, not a separate kind of knowledge.
- `factual_record` + `media_framing` → **`documented_activity`**. "How it was
  portrayed, and by whom" is recoverable at item level, where News already
  records `source_type` and `attribution` per article. The two-level model (§4)
  earns its keep here: the contract stays coarse, the item stays precise.
- `brand_claim` → **`interested_claim`**, generalised beyond brands. A rights
  holder, an agency, a vendor case study in the Research Library and a
  consultancy's own publication are the same claim shape.
- `prior_knowledge` + `market_context` → **`established_knowledge`**. Both are
  "known before this engagement, and not about this engagement".

### Deliberately deferred

**`observed_behaviour`** — what people measurably did — is *not* in the starting
set, because no built source supplies it. It is the first kind that will need
adding, and the trigger is explicit: **the moment Trend Analysis, CRM or POS
becomes real.** Search volume, transactions and CRM events are things people
measurably did, and folding them into `elicited_perception` would license exactly
the failure this methodology exists to stop ("search interest rose" →
"fans grew more positive"). Recorded here so that when the time comes it is a
deliberate addition rather than a rediscovery.

Two properties matter as much as the list:

- **Every kind carries an explicit negative.** The "cannot establish" column is
  not commentary; it becomes prompt text and attribution rules. This is what
  generalises the existing `NEWS_SOURCE_TYPE_ATTRIBUTION_RULE` to the platform.
- **Kinds are claims about knowledge, not quality.** An `interested_claim` is not
  weak evidence. It is *precisely strong* evidence of what that party claimed.

---

## 4. The contribution contract

Each evidence source declares one contract, once, at the platform level.

```
EvidenceContribution {
  source:      ResearchMethod        // conversation | survey | news | library | …
  supplies:    ContributionKind[]    // what it can legitimately establish
  cannot:      ContributionKind[]    // what it must never be read as establishing
  unit:        string                // "a collected conversation", "an article"
  caveat:      string                // the standing warning that travels to Analysis
}
```

**Ownership is fixed: the Research Design owns contribution.** Contracts and
projections are methodology, so they are authored with the design and inherited
by tasks. A connector never declares what it contributes, and a search never
overrides it. This keeps the acquisition contract (`lib/connectors/types.ts`,
"what can this connector fetch") cleanly separate from the interpretation
contract ("what can this evidence establish") — two questions that look similar
and must not be conflated.

Filling in the four sources you named:

| Source | Supplies | Explicitly cannot |
|---|---|---|
| **Survey Research** | `elicited_perception` | `documented_activity`; anything observed rather than reported |
| **Conversation Intelligence** | `unprompted_discourse` | `documented_activity`; population magnitude |
| **News Coverage** | `documented_activity`, `interested_claim`, `expert_judgement` | `elicited_perception`, `unprompted_discourse` |
| **Research Library** | `established_knowledge`, `expert_judgement`, `documented_activity` (historical), `interested_claim` (vendor case studies) | `elicited_perception` *for this engagement* |

The News row is the fix stated as methodology: News **supplies** the activation
chronology and the brand's own account, and **cannot** supply fan perception —
which is exactly what the item-level classifier already records per article
(`fan_evidence: none`).

The Research Library row is worth noting: it supplies `interested_claim` too,
because a vendor case study or a consultancy's own report is the same claim shape
as a press release. That falls out of the vocabulary rather than needing a
special case, which is a reasonable sign the vocabulary is right.

### Two levels, deliberately

The contract is what a source **can** contribute. It does not predict what any
given item **does** contribute.

- **Contract level** (this document): News can supply `brand_claim` and
  `factual_record`.
- **Item level** (already built for News): *this* article is a
  `brand_announcement` with `claim_basis: attributed_claim` and
  `fan_evidence: none`.

The contract sets the question the classifier is allowed to ask. The item-level
judgement answers it. Other sources would gain an item-level vocabulary of their
own over time; the contract is what they need first.

---

## 5. Projection: the mechanism that fixes the bug

**A requirement's needs must be projected through a source's contract before
that source is judged against them.**

Today a requirement carries one list of needs, written in the language of the
primary method, and every source is handed it verbatim. Instead, each
`MethodRecommendation` carries the needs **as that method can address them**.

For the FedEx direct requirement, *"Understand current fan perceptions of FedEx's
involvement in the UEFA Champions League"*:

| Method | Fit | Contributes | Projected needs |
|---|---|---|---|
| Survey | primary | `fan_perception`, `intent` | *What do fans associate with FedEx's sponsorship?* · *How do fans perceive its value?* |
| News | supporting | `factual_record`, `brand_claim`, `media_framing` | *What has FedEx actually done through the sponsorship?* · *How is it portrayed, and by whom?* |
| Conversation | conditional | `public_discourse` | *Where fans do discuss it unprompted, what do they say?* |

The requirement is unchanged. What changes is that each source is asked the
question it can actually answer. This is the exact transformation measured at
0% → 80%.

**The projection is a design-time artefact, not a runtime inference.** It is
generated with the Evidence Strategy, reviewed on the strategy screen, approved
with everything else, and carried onto the task. A researcher can see and correct
what each source has undertaken to contribute *before* any collection happens —
which is the same principle as approving the strategy rather than the search
terms.

### Two invariants

1. **No source is judged against a need it has not undertaken to answer.**
   This is what makes the FedEx case studies relevant.
2. **No need is silently unassigned.** If no recommended source can address a
   need, the design must say so, in the same place it already records
   `not_worth_attempting`. This is what stops projection quietly shrinking the
   research.

The second matters more than the first. Without it, projection becomes a way to
make every source look successful by narrowing what it was asked.

### Legacy designs: derive, never re-approve

An approved design that predates this methodology has no `contributes` and no
projected needs. It must keep working, and it must not need re-approval — the
FedEx engagement cannot be delayed by a methodology improvement.

So there are **two forms of projection**, and they are not equally strong:

| | Authored projection | Derived projection |
|---|---|---|
| Source | Research Design analyst, reviewed and approved | Computed on read, deterministically |
| Needs | Rewritten per method | **Left as written** |
| Contract | Carried explicitly | Carried explicitly |
| Cost | One approval cycle | None |
| Evidence | **Measured: 0% → 80/60/60%** | **Not yet measured** |

The derived path passes the source's contract alongside the requirement's
original needs, and instructs the classifier to judge the item through what this
source can contribute rather than requiring it to answer a need the source cannot
answer. It is deterministic — a pure mapping, no AI call — so it adds no cost or
latency on read, and it is reproducible.

**One honest caveat, and it matters for FedEx.** What I measured at 0% → 80% was
the *authored* form: the needs themselves were restated. The derived form is a
weaker variant of the same idea, and it is **untested**. Before the FedEx project
relies on it, the derived path should be run against those same three ESA case
studies. If derivation alone does not recover them, the fallback is narrow and
cheap: let the FedEx design pick up an authored projection at its next approval,
which it will need anyway once News goes live.

Derived projections are **persisted on the next approval**, so a design converges
on the authored form naturally rather than deriving forever.

---

## 6. What each consumer does with it

### Advisory at collection, enforced at attribution

The `cannot` list behaves differently at the two ends of the pipeline, and the
asymmetry is deliberate.

**At collection it is advisory.** It tells the classifier what this source is
being asked for, so an article is not rejected for failing to answer a question
it was never asked. It is **never a hard filter**: an item that scores well
outside the contract is still collected, still stored and still visible. This
preserves the pipeline's existing and correct rule — *relevance decides what
surfaces, never what is kept* — and means a genuine edge case (a trade article
that does happen to quote fans) is not thrown away by a rule about its source.

**At attribution it is enforced.** Analysis may not assert a kind the source's
contract excludes, regardless of how the item scored or what the text seems to
say. News evidence cannot become a statement about fan perception. Library
evidence cannot become a finding about this engagement. This is the hard edge,
and it belongs here because attribution is where an overstatement becomes a
client-facing claim.

The consequence worth stating plainly: **an item may legitimately be collected
and then be unusable for the claim someone wants to make from it.** That is the
correct outcome, and it must be *visible* — the item is shown with its contract
violation, never silently dropped, so a researcher can see that the evidence
exists but does not support the inference.

**Collection-time classifiers** (`buildClassificationPrompt`,
`buildNewsClassificationPrompt`) receive the projected needs plus the contract's
`supplies` and `cannot`, as guidance. The Evidence Role test is unchanged and
still overrides.

**Synthesis-time classifier** (`aspect-classify.ts`) gains the same input. It
currently has no source model at all beyond a `unitLabel` string, so this is
where the change buys the most.

**Analysis** (`analyseAspectSynthesis`) already composes attribution rules per
Evidence Role and, since the News work, per news source type. Contribution kinds
slot into the same block: each kind's "cannot establish" becomes an attribution
prohibition, stated for exactly the kinds present. The pattern is proven — this
generalises it rather than inventing it. This is the enforced edge.

**Evidence Strategy screen** shows, per requirement, what each recommended source
will contribute and what it explicitly will not. That is a genuine improvement to
the artefact: it currently shows *that* News was recommended and *why*, but not
*what it will actually tell you*.

**Report readiness** gains a real question: are there requirements whose needed
contribution kinds no attached source supplies? Today an approved project can
reach Analysis with a structural evidence gap that nothing detects.

---

## 7. Adding a new source

The test of whether this is a platform methodology rather than a News patch.

To add Trend Analysis, Industry Reports, CRM or POS:

1. Declare its contract: `supplies`, `cannot`, `unit`, `caveat`.
2. That is the whole methodology step.

The design generator learns it can recommend the method for requirements needing
those kinds; projection generates its needs; the classifier judges against them;
Analysis attributes it correctly; the strategy screen explains it. Nothing else
changes — the same promise the Connector contract already makes for acquisition,
extended to interpretation.

Worked example — Trend Analysis supplies `observed_behaviour` (search volume is
something people measurably did) and `emerging_theme`, and cannot supply
`fan_perception` (volume is not opinion) or `factual_record`. That single
declaration is enough to stop "search interest rose" becoming "fans grew more
positive" — a failure of exactly the same shape as the one that prompted this.

---

## 8. Back-compatibility

- Additive. `EvidenceContribution` and the projected needs are new fields; absent
  values mean "as today".
- No schema change. Contracts are code-level constants; projections ride in the
  existing `research_design` and `information_needs` jsonb.
- **Existing approved designs keep working**, but keep the old behaviour — the
  FedEx design would need re-approval to gain projected needs, or a one-off
  derivation. That trade-off is worth surfacing before implementation (§10).
- The two generators stop hardcoding `method_fit: "primary"`, and `flattenNeeds`
  stops discarding the verdict.

---

## 9. Non-goals

- **Not a quality ranking.** No kind outranks another. A `brand_claim` is not
  worse than `factual_record`; it is different, and labelled.
- **Not a replacement for Evidence Role.** Role governs *whose* evidence it is;
  contribution governs *what kind* it is. Both are needed.
- **Not automatic requirement rewriting.** Projection adds a source-specific
  view; it never edits the requirement.
- **Not a way to make sources look successful.** Invariant 2 exists precisely to
  prevent that.

---

## 10. Decisions taken

Settled 2026-07-23. These are no longer open.

1. **Legacy designs derive, and never re-approve.** Projections are computed
   deterministically on read for designs that lack them, and persisted at the
   next approval. FedEx is not delayed by a methodology improvement. (§5)
2. **Research Design owns projection.** Not connectors, not individual searches.
   Contribution is methodology, authored once and inherited. (§4)
3. **Advisory at collection, enforced at attribution.** Nothing useful is
   discarded during collection; Analysis may never overstate what a source can
   prove. (§6)
4. **Start with the smallest useful vocabulary.** Six kinds, reduced from twelve
   by the test "does this kind carry a prohibition no other kind carries?".
   `observed_behaviour` is deferred with an explicit trigger. (§3)

## 11. Remaining risk

One, and it is worth watching rather than solving now.

**The derived path is unmeasured.** What was measured at 0% → 80/60/60% was the
authored projection. Derivation is the same idea in a weaker form, and it is what
FedEx will actually run on. The check is cheap — re-run the three ESA case
studies through the derived path — and it should happen before News goes live,
not after. If derivation alone does not recover them, FedEx takes an authored
projection at its next approval, which it needs anyway.

Everything else here follows patterns already proven in the codebase: the
attribution block in `analyseAspectSynthesis` already composes per-role and
per-source-type rules, and the two generators already inherit design decisions
onto tasks.

---

*Note: `lib/information-needs.ts` references `docs/research-methodology.md`,
which does not exist. This document may be what that reference was reaching for;
renaming is a one-line change if preferred.*
