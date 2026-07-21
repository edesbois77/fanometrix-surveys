# Research Project & Research Design — Domain Model

**Status:** Canonical architecture specification. This is the reference every
Research Project (RP) feature is built against. Where a section is marked
*(provisional — to ratify)* the position stated is the working default; changing
it is a deliberate amendment to this document, not an implementation detail.

**Related canon:** `docs/research-methodology.md` (the research-consultancy
philosophy), `docs/conversation-advisor.md` (the first specialist method),
`docs/evidence-lifecycle.md` (the append-only evidence base and review gate).

---

## 1. Purpose

Fanometrix is a research consultancy, not a bag of tools. The platform decomposes
a decision into the evidence required to make it, then collects that evidence by
whatever method fits. This document defines the two objects that carry that model
and the rules that keep every feature coherent:

- the **Research Project** — the engagement, and
- the **Research Design** — the approved methodology the engagement runs on.

The central architectural commitment: **there is one approved Research Design per
project, and every specialist research method consumes it rather than generating
its own independent planning.** This is what makes Fanometrix behave like one
consultant with a plan, not several tools each guessing.

## 2. Scope & non-goals

**In scope:** the Project and Design entities; Information Needs; Research Aspects;
Method Assignment; the authored-vs-measured split; versioning, approval and
evidence lineage; the consumption contract every method obeys.

**Non-goals:** UI/IA (a later redesign builds *against* this doc); connector
internals; the mechanics of any one method's execution (each specialist owns its
own how). Evidence storage and validation are specified in
`docs/evidence-lifecycle.md`; this doc references but does not restate them.

## 3. The ownership boundary

Keep this line bright — everything else derives from it.

| | **Research Project** | **Research Design** |
|---|---|---|
| Answers | *who, why, for whom* | *what we will investigate, and how* |
| Owns | client/brand, audience, commercial objective, timeline, people, status | research questions, information needs, method assignment, recommended methods, methodology gaps, approval, version |
| Lifespan | long-lived, singular | versioned; one **active** (approved) version + history |
| Never owns | methodology | engagement facts (client, dates, people) |

A Project **owns** one active Research Design plus its version history. The Design
never holds engagement facts; the Project never holds methodology. A field that
would sit awkwardly on both belongs on whichever answers its question above.

## 4. Entities (canonical definitions)

**Research Project** — the engagement. The container a client relationship and its
commercial objective live in. Holds 0..1 *active* Research Design and the full set
of prior versions.

**Research Design** — the approved methodology for a project, as a **versioned,
approvable object**. The single source of truth for: research question(s),
Information Needs, Knowledge Gaps (methodology), Recommended Methods,
method-specific objectives, approval status and version history. Confidence and
evidence-gaps are *surfaced on* the Design but *measured from evidence* (see §5).

**Research Question** — the decision-shaped question the design exists to answer.
A design has one **primary** question and may decompose it into **sub-questions**.
*(provisional — to ratify: a genuinely distinct second study becomes a second
Research Design under the same Project, not a second primary question.)*

**Information Need** — the durable unit of research: an answerable sub-question
about the world (never a keyword, never a method). Evidence is judged against
needs. Each need has a **stable identity** that persists across design versions
(see §7). Defined in code by `lib/information-needs.ts`.

**Research Aspect** — the durable organising theme that groups one or more
Information Needs, and the axis Analysis synthesises along. Aspects are shared
across every evidence source ("ONE aspect architecture"). A need belongs to
exactly one aspect; an aspect contains one or more needs.

**Method Assignment** — the mapping of an Information Need to the method(s) that
will answer it, each with a **method-fit verdict** and a **method-specific
objective**. This is the router between the design and the specialists (see §6).

**Recommended Method** — a method the design endorses (or declines) for the
engagement, with suitability and rationale. Method-level, distinct from the
per-need Method Assignment.

**Knowledge Gap** — something the research does not yet know. Two kinds, kept
separate: **methodology gaps** (authored — what the design cannot cover) and
**evidence gaps** (measured — a need the collected evidence has not yet answered).

**Assumption** — a load-bearing premise the design rests on (audience definition,
generalisability of prior evidence, scope of the question). Authored, versioned
with the design. Each is a *condition of validity*: invalidating an assumption is
the concrete trigger to fork a new design version (§7). This is the mechanism
behind "if assumptions change, the design evolves." (Introduced with the Planning
stage — `docs/planning-page.md`.)

**Risk** — a threat to the programme achieving its success criteria, carried with
a mitigation the design already applies. Authored, versioned with the design.

**Specialist Method / Advisor** — Conversation Intelligence, Survey Research, the
Research Library, and future products. Each **consumes** the approved design and
produces evidence tagged to Information Needs. None re-plans (see §8).

## 5. The Research Design anatomy — authored vs measured

The design's contents are two different *kinds* of thing, and conflating them
corrupts the model. **Authored** content is decided during planning and approved.
**Measured** content is written by evidence and merely *surfaced* on the design.

| Field | Register | Notes |
|---|---|---|
| Research question(s) | **Authored** | primary + sub-questions |
| Information Needs | **Authored** | the spine; stable ids |
| Method Assignment (fit + objective) | **Authored** | per need → per method |
| Recommended Methods | **Authored** | suitability + why |
| Knowledge Gaps — methodology | **Authored** | what the design can't cover |
| Approval status / Version | **Authored** | see §7 |
| **Confidence per need** | **Measured** | computed by Analysis against the need |
| **Knowledge Gaps — evidence** | **Measured** | needs with insufficient/no evidence |

**Rule:** the Design owns the *yardstick*; evidence writes the *score*. Confidence
appears on the Research Design view but is a read-through from Analysis keyed to
the design's Information Need ids — never a planning-time number. This preserves
the standing principle (confidence is Analysis's word, from real evidence) while
giving one single pane. Measured content is **never** persisted as part of an
approved design version; it is derived and cached against need ids.

## 6. Information Needs & Method Assignment (the spine)

The need structure — `Aspect → Need` — is the design's core, defined neutrally in
`lib/information-needs.ts` (`InformationNeeds { themes: [{ aspect, description,
needs: [{ need, method_fit, rationale }] }] }`). On top sits the **Method
Assignment** layer, which is what "method-specific objectives" means:

```
Information Need ──assigned to──▶ Method(s), each carrying:
   • method_fit  : primary | supporting | conditional | not_suitable
   • objective   : what THIS method must produce for THIS need
```

**method_fit is a per-method assessment of a shared need, not an intrinsic
property of the need.** The same need may be `primary` for Conversation and
`not_suitable`-alone-therefore-`primary`-for-Survey. The four verdicts:

- **primary** — this method is the best available evidence for the need.
- **supporting** — it illustrates but cannot settle the need.
- **conditional** — it becomes useful only after another method establishes the
  vocabulary/structure (a directed, time-ordered dependency between methods).
- **not_suitable** — it will mislead if used to answer the need; route elsewhere.

`conditional` is what lets methods hand work back and forth (e.g. Conversation →
Survey → Conversation), so the assignment graph is a loop, not a one-way list.

## 7. Lifecycle — versioning, approval, immutability

A Research Design **evolves, is versioned, and is approved independently** of the
evidence collected under it.

- **States:** `Draft → Proposed → Approved → (edit) → new Draft → re-Approved`;
  a superseded version becomes `Archived`. Exactly **one Approved version is
  active** at a time — that is what consumers resolve.
- **Approval is a human gate** — the researcher's "Confirm research approach"
  action. Light, not a heavyweight artefact: needs and assignments can be added,
  removed, reprioritised and challenged before confirming.
- **Immutability:** an Approved version is a frozen snapshot. Editing forks a new
  Draft from it; the new version must be re-approved. Authored content (including
  method_fit) is versioned with the design *(provisional — to ratify)*.
- **In-flight work on re-approval:** approving a new version does **not**
  retroactively invalidate evidence already collected; the evidence-review gate
  (`docs/evidence-lifecycle.md`) governs what feeds Analysis. New collection runs
  against the newly approved version *(provisional — to ratify)*.

## 8. Evidence lineage & integrity

This is the rule set that makes versioning safe rather than corrupting.

- Every piece of evidence records **the design version and the stable need id** it
  was collected against. (`social_mentions` already carries `information_need` and
  `research_aspect`; the stable-id reference is the outstanding "seam 3" — it MUST
  land before significant production evidence accumulates.)
- On evolution to a new version:
  - a need that **persists** keeps its stable id → its evidence stays attached;
  - a need **dropped** in the new version leaves its prior evidence intact, marked
    against a **retired** need — nothing is orphaned or deleted (consistent with
    the append-only evidence base);
  - Analysis can report a need as "answered under v1, re-opened in v2".
- Because evidence references needs by **stable id, not verbatim text**, a need
  can be re-worded, merged or re-assigned without breaking its evidence.

**Without stable need ids, versioning corrupts evidence. With them, the design is
free to evolve.** This is the single most important integrity constraint in the
domain.

## 9. The consumption contract

Every specialist method obeys one contract, and it has two roles:

- **Propose** (design-authoring) — a method's advisor may contribute candidate
  Information Needs, method recommendations and gaps *into* the Design. This is
  where the project-level research-design authoring engine and the *design half*
  of each method advisor live.
- **Consume** (execution) — a method reads the **approved** design's needs and its
  own method objectives, and produces only method-specific execution detail
  (Conversation: search strategy, platforms, queries; Survey: the instrument;
  Library: retrieval). **A method never re-plans.**

The **read seam already exists**: `resolveInformationNeeds(source)` in
`lib/research-sources/information-needs.ts` is the single path through which any
consumer obtains needs. Today it reads the Conversation Advisor's briefing; when
needs move to the project's Research Design, only that function's body changes —
it becomes "load the project's *approved* design" and is where "resolve the
approved version" is enforced. Every consumer keeps working untouched.

**This contract removes today's double-planning.** Currently two engines plan
independently: `analyseResearchPlan` (project themes + method configs) and
`analyseConversationAdvisor` (needs + recommendation). Under this model they merge
into one authoring engine that writes the Design once; specialists consume it.

## 10. Invariants (rules every RP feature must uphold)

1. A Project has at most **one active (Approved) Research Design**; consumers only
   ever read the active version.
2. Methodology lives **only** on the Research Design; engagement facts live **only**
   on the Research Project.
3. **No method generates independent planning.** Planning is authored into the
   Design; methods consume it.
4. Needs are read **through the resolver**, never by reaching into a method's
   storage. No feature may assume needs live on a conversation search (or any one
   product).
5. **Confidence and evidence-gaps are measured, never authored.** They are not
   persisted on an approved design version.
6. Evidence references needs by **stable id**, and records the **design version**
   it was collected under.
7. An Approved design version is **immutable**; changes create a new version that
   must be re-approved.
8. `method_fit` is a **per-method assessment**, never treated as intrinsic to a
   need.
9. Nothing is deleted to evolve a design; dropped needs are **retired**, their
   evidence preserved (append-only).
10. Aspects are **shared** across all evidence sources; a method must not invent a
    private aspect vocabulary.

## 11. Conceptual data model (not DDL)

Indicative shape; normalisation to be finalised at build time.

- **`research_projects`** — engagement facts. Points to the active design version.
- **`research_designs`** — one row per **version**: `project_id`, `version`,
  `status`, `approved_by/at`, `supersedes`, and the authored payload (research
  questions, recommended methods, methodology gaps). One row per version yields
  version history for free.
- **Information Needs — normalised, not embedded.** A need is referenced by
  evidence across products and versions, so it needs a **stable `need_id`** and
  its own rows, not a jsonb blob inside the design. Each design version references
  the set of needs it includes plus that version's wording and Method Assignments.
- **Method Assignment** — `(design_version, need_id, method)` → `method_fit`,
  `objective`.
- **Evidence** (`social_mentions` and future per-method evidence) — carries
  `need_id` + `design_version` for lineage.
- **Measured (confidence, evidence-gaps)** — **not** stored on the design;
  computed by Analysis against `need_id` and cached separately.

## 12. Relationship to today's implementation & migration path

**What exists now:**
- A proto-design: `research_plan` (on `research_summaries`, migration 117) —
  objective, hypothesis, assumptions, recommended methods, evidence themes, method
  configs, gaps, limitations (`lib/research-plan.ts`).
- Information Needs on the Conversation Advisor briefing
  (`social_searches.information_needs`, migration 127), typed neutrally in
  `lib/information-needs.ts`.
- The resolver seam (`resolveInformationNeeds`) and the neutral needs module —
  both already in place.
- Evidence keyed to needs/aspects (`social_mentions.information_need` (128),
  `research_aspect` (116)) and the append-only evidence base + review gate
  (`docs/evidence-lifecycle.md`).

**Migration (each step additive and consumer-invisible thanks to the resolver):**
1. **Stable need ids** ("seam 3") — prerequisite for versioning; land before
   significant production evidence.
2. **Introduce `research_designs`** as the versioned container; migrate
   `research_plan`'s fields into it; lift `information_needs` into normalised need
   rows; point the resolver's project path at the approved design.
3. **Retire double-planning** — the Conversation Advisor becomes propose+consume;
   `analyseResearchPlan` becomes the design-authoring engine; Survey and Library
   consume from day one.

## 13. Open decisions to ratify

1. One primary research question per design, with distinct studies as separate
   designs under the project (§4) — recommended.
2. `method_fit` versioned with the design vs free to drift (§7) — recommended
   versioned.
3. New approved version: run existing collection to completion vs re-gate
   immediately (§7).
4. Confidence rollup granularity — per need, rolled to aspect for display (§5) —
   recommended.

## 14. Change log

- v1 — Initial canonical specification. Establishes the Project/Design ownership
  boundary, the authored-vs-measured split, Information Needs + Method Assignment,
  versioning & evidence lineage, and the consumption contract. Provisional items
  flagged for ratification in §13.
