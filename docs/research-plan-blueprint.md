# Fanometrix — Research Planning Blueprint (the Research Plan as project briefing)

> **Status:** **Agreed / canonical** (architecture). Implementation pending the four
> §11 decisions (recommended defaults stand unless changed). Defines the complete
> research journey — **Research Question → Research Plan → Research Methods →
> Execution → Analysis** — and establishes the **Research Plan as the project's
> briefing document that drives every research method**, not a Conversation
> Intelligence feature. Conversation Intelligence is simply one method the plan
> configures automatically, alongside surveys, research-library documents and (in
> future) news. The plan is a **methodology-first research advisor** built as an
> orchestration layer over machinery that already exists (Search Strategy, the
> connector registry, `research_summaries`, the create-search API) — not a new
> engine.

---

## 1. The reframe — the Research Plan is the briefing, not a search tool

Today a project is a bag of methods a researcher assembles by hand, starting (for
conversations) by typing keywords. That is source-first and method-fragmented. The
Research Plan inverts it:

> **Start with the research question. The plan decides how to answer it, and then
> drives every method the project uses.**

The Research Plan is the **briefing document for the whole project**. It decides the
methodology, recommends and *configures* each method, predicts where evidence will
fall short, and hands each method its marching orders. Conversation Intelligence
becomes one configured method — the plan auto-generates its searches — exactly as a
survey or a document request is another.

This makes Fanometrix feel like an **AI research director** that designs a study and
sets up its instruments, not a toolbox the user wires together.

### Agree the methodology first — the consultancy model

The plan's deepest benefit is *when* it happens: **before any evidence is
collected.** It gives the client a chance to **challenge and refine the research
approach up front** — exactly how a human research consultancy works. A good agency
doesn't silently run off and gather data; it agrees the methodology with the client
first — which methods, why, what each will contribute, what it won't, and what the
client will get — and only then executes. Replicating that conversation inside
Fanometrix is what turns it from an automated data-collection tool into a
**professional research partner**: the plan is the methodology the client signs off,
and execution is the agency delivering against an agreed brief.

### The organising principle — research decisions, not software configuration

The single test that ties the whole workflow together. At **every** step, ask:

> **Is this a research decision or a software configuration decision?**

- A **research decision** shapes *what the study is* — the research question, the
  methodology, whether the approach is right. These belong to the researcher; the
  plan surfaces them and invites challenge.
- A **software configuration decision** is *how the tools are set up to execute that
  research* — keywords, search queries, connector selection, breadth, markets,
  languages, relevance thresholds, collection windows. Fanometrix should make these
  **automatically**, from the plan.

The researcher spends their time on the research: refining the question, reviewing
the proposed methodology, deciding whether they agree. They should **never** have to
choose keywords, configure a search, or wire methods together — unless they
explicitly want advanced control.

| Decision | Kind | Who / how |
|---|---|---|
| The research question | **Research** | The researcher — the one input that matters |
| Which methods to use | **Research** | Advisor proposes · researcher agrees / challenges |
| Whether the methodology is right | **Research** | Researcher approves / refines |
| Search keywords & queries | Config | **Automatic** (Search Strategy) |
| Connectors / sources | Config | **Automatic** (availability) |
| Breadth, markets, languages | Config | **Automatic** (derived from the question) |
| Relevance threshold, window, frequency | Config | **Automatic** (sensible defaults) |
| Survey target / markets, document scope | Config (proposed) | **Auto-proposed**, researcher confirms scope |

Advanced control stays available on demand — a power user can open any
auto-configured search or method and override it — but it is **opt-in, never the
default path**. This is what makes Fanometrix feel less like a platform with several
tools and more like a **research partner that happens to automate those tools**.

---

## 2. The complete journey

```
 RESEARCH QUESTION            RESEARCH PLAN                 RESEARCH METHODS            EXECUTION            ANALYSIS
 (project level,      ─▶  the briefing: objective,   ─▶  the plan CONFIGURES     ─▶   collect /      ─▶   confidence
  already captured)        methodology, themes,           each method:                deploy /             computed FROM
                           evidence requirements,         • Conversation → searches   ingest               the evidence
                           gaps  ·  review + approve      • Survey → brief                                 (existing engine)
                                                          • Document → desk research
                                                          • News → gap (no connector)
                                                              │ review search preview
                                                              ▼ (Draft) before it runs
```

- **Research Question** — the project's question (`research_projects.research_question`),
  today under-used; the plan makes it the driver.
- **Research Plan** — the briefing (§4). Reviewed, edited, approved by the researcher.
- **Research Methods** — the plan *populates and configures* the Research area's
  methods. Each method arrives pre-filled with the plan's recommendation; the user
  reviews/adjusts/approves.
- **Execution** — each method runs (collect conversations, deploy the survey, ingest
  documents), unchanged from today.
- **Analysis** — computes **research confidence from the evidence actually
  collected** (the engine we already built).

The plan is the top of the funnel; everything downstream is configured by it, and
the existing collect → analyse pipeline is untouched.

---

## 3. Method suitability (before) vs research confidence (after) — the backbone

The most important distinction in this design. Two different judgements, at two
different times, that must never be conflated:

| | **Method Suitability** | **Research Confidence** |
|---|---|---|
| **When** | Before collection — in the **Plan** | After collection — in **Analysis** |
| **Question** | *Is this method the right instrument for this question, and what evidence would it need to answer well?* | *Given the evidence we actually gathered, how far can we trust the answer?* |
| **Basis** | Method fit + evidence *requirements* (prospective) | The evidence itself — volume, relevance, agreement, source diversity, contradictions, gaps (retrospective) |
| **Vocabulary** | **method suitability**, **expected contribution**, role, limitations, expected outputs | **research confidence** — High / Medium / Low, derived |
| **Owner** | The advisor (`analyseResearchPlan`) | `deriveFindingConfidence` / aspect synthesis |

**The word "confidence" is reserved for Analysis.** Before evidence exists there is
nothing to be confident *about*, so the plan never uses it. Instead it speaks of
**method suitability** (is this the right instrument?) and **expected contribution**
(what this method will bring to the answer, and what it won't). A method can be
perfectly suitable — a survey is the right instrument for incidence — and still, once
run, yield Low research confidence if the evidence gathered is thin. Suitability and
expected contribution are about the *plan*; confidence is about the *result*, and
only Analysis, reading real evidence, may claim it.

**The loop that ties them together:** the plan's **evidence requirements become the
yardstick** Analysis reads against. Because the plan states, per theme, the evidence
required to answer it, Analysis can later report **two distinct things**:

1. **Research confidence** — how far the findings can be trusted, from the evidence
   itself (already built).
2. **Methodology execution completeness** — *how completely the planned methodology
   was actually executed*: did we collect the evidence the plan said each theme would
   need? A plan-expected method that produced nothing, or a theme that fell short of
   its required evidence, is reported as an execution gap that **cites the plan**.

This is the closed loop — **Research Question → Research Plan (planned evidence) →
Execution (collected evidence) → Analysis (findings + confidence + execution
completeness)** — and it lets Analysis report not only on the *findings* but on the
*quality of the research process itself*: a strong finding on thin execution reads
very differently from a strong finding on a fully-executed plan.

---

## 4. The Research Plan (briefing) structure

Stored as a `research_plan` output on `research_summaries`
(`source_type = "research_project"`), reusing `store.ts` and the
draft→edited→approved lifecycle unchanged.

```
ResearchPlan {
  objective: string,                          // what the research must establish
  hypothesis: string | null,                  // an initial hypothesis where the question invites
                                              //   one — the working answer the research will test
                                              //   (null when the question is purely exploratory)
  assumptions: string[],                      // assumptions the methodology rests on, stated up
                                              //   front so the client can challenge them

  methodology: {
    recommended_methods: [ {
      method: "conversation" | "survey" | "document" | "news",
      recommended: boolean,
      suitability: "Well suited" | "Partly suited" | "Not suited",  // method fit — NOT confidence
      why_recommended: string,                 // why this method fits the question
      role: string,                            // the role it plays in answering the question
      expected_contribution: string,           // what it will bring to the answer (pre-evidence)
      evidence_requirements: string,           // what evidence is needed to answer well
                                               //   ("incidence across GB/DE; ≥~200 responses")
      limitations: string,                     // what it cannot establish, even done well
                                               //   ("conversations skew to vocal voices; can't quantify")
      expected_outputs: string,                // what the client gets from this method if completed
      available: boolean,                       // usable today (connector / method exists)?
      availability_note: string | null,         // e.g. "No news connector yet"
    } ],
    approach: string,                           // the methodology in a sentence or two
    advisor_note: string,                        // "Conversations give sentiment; a survey is
                                                //  needed to measure how widespread it is."
  },

  expected_outputs: string[],                   // what the PROJECT will be able to say / deliver if the
                                                //   recommended methodology is completed — the client's
                                                //   "here is what you'll get" (never a claimed answer)
  remaining_limitations: string[],              // what the methodology still won't answer, stated up front

  evidence_themes: [ {                          // method-agnostic — the aspect spine (§6)
    theme: string,                              // short Title Case — becomes a Research Aspect
    description: string,
    best_methods: EvidenceMethod[],
    required_evidence: [ {                      // STRUCTURED so Analysis can compare planned vs collected
      method: EvidenceMethod,
      description: string,                      // what evidence from this method answers the theme
      rough_target: string | null,             // a checkable target ("≥30 relevant conversations",
                                               //   "≥200 survey responses across GB/DE") or null
    } ],
  } ],

  method_configs: {                             // what the plan hands each method (§5)
    conversation: [ { theme, research_question, strategy: SearchStrategy, sources[] } ],
    survey:       { recommended: boolean, brief: string, themes[], suggested_target, markets[] } | null,
    document:     { recommended: boolean, brief: string, looking_for[] } | null,
    news:         { recommended: boolean, brief: string, available: false } | null,
  },

  expected_coverage: [ { theme, method, coverage: "strong"|"partial"|"none" } ],

  gaps: [ {                                     // predicted BEFORE collecting
    theme: string | null, missing: "method" | "source",
    message: string, recommended_action: string,
  } ],

  generated_at, edited, model,
}
EvidenceMethod = "conversation" | "survey" | "document" | "news"
```

**Note what is deliberately absent: no confidence scores, nowhere.** The plan carries
method **suitability**, **expected contribution**, **role**, **limitations** and
**expected outputs** — the things a research consultancy puts in a methodology brief.
Confidence is Analysis's job, from real evidence (§3). Every method is stated with
what it *will* contribute and what it *can't*, so the client sees an honest brief,
not a promise.

---

## 5. How the plan configures each method

The plan doesn't just recommend methods — it **sets them up**:

- **Conversation** — fully generatable today. Approving the plan auto-creates one
  Conversation Search per theme (each pre-loaded with a `SearchStrategy` from
  `analyseSearchStrategy`), as **Draft**. A **search preview** then lets the
  researcher review/adjust/remove before anything runs (§ two gates below).
- **Survey** — the plan produces a **survey brief**: the themes to measure, a
  suggested target response count and markets, drawn from the evidence requirements.
  v1 surfaces this as a recommendation that links into the existing survey create
  flow; auto-drafting a survey is a later phase.
- **Document / research library** — a **desk-research brief**: what to look for and
  why, linking into the document add flow.
- **News** — recommendable as a method, but **no news connector exists**, so it is
  always a *gap + recommendation* (`available:false`), never an auto-generated dead
  search, until a connector is built.

**The advisor principle holds across all methods:** when the recommended methods
can't answer the question well on their own, the plan says so and recommends adding
another method — it never fills a methodological gap by generating more of the same.

**Two human gates**, matching how we already work:
1. **Approve the plan** — the methodology is right (reuses the `research_summaries`
   draft→approved lifecycle).
2. **Review each configured method** — most concretely the **conversation search
   preview** (Draft searches) before execution, so nothing collects until the
   researcher runs it, fitting the Evidence Validation gate.

Manual method setup stays available for power users — the plan is the new default
front door, not a removal of capability.

---

## 6. The architectural unlock — planned themes become the project's aspect spine

Today Research Aspects are discovered *after* collection, and (Analysis Step 3) we
added `candidateAspects` alignment so survey/document evidence merges into the
aspects conversations discovered. If the **plan defines the themes up front**, those
themes become the project's **canonical aspect vocabulary**:

```
Plan themes ─▶ every method (conversations, survey, documents) ─▶ evidence classified
            ─▶ INTO the same planned themes ─▶ Analysis chapters organised by them,
               with confidence measured against the plan's evidence requirements (§3).
```

Planning, collection and analysis finally share one spine — the plan's
`evidence_themes` seed the `candidateAspects` the classifier already accepts. No new
mechanism; an existing seam fed earlier.

---

## 7. Reuse map

| Plan capability | Reused from |
|---|---|
| Grouped/anchored search terms per theme | `analyseSearchStrategy` + `SearchStrategy` (`lib/search-strategy.ts`) |
| Source/method availability | connector registry `CONNECTORS` + `isConfigured()`/`capabilities`; `lib/research-sources/registry.ts` for survey/document/conversation |
| Reviewable → editable → approvable briefing | `research_summaries` + `store.ts`; new `research_plan` `output_type` = one CHECK-widen migration (pattern of 074/088/117) |
| Route/workflow template | `app/api/research-projects/[id]/aspect-synthesis/route.ts` + edit/approve/publish siblings |
| Generate + attach a conversation search | `POST /api/social/searches` → `POST /api/research-projects/[id]/evidence` (looped per theme) |
| Method surfaces to drive | the Research area methods grid (`ResearchBody.tsx`) |
| Confidence AFTER collection | the existing Analysis engine (`deriveFindingConfidence`, aspect synthesis) — untouched |

---

## 8. What's genuinely new (build scope)

1. **`analyseResearchPlan`** — the advisor analyst: research question → objective,
   methodology (method **suitability** + **evidence requirements** + availability),
   themes, per-method configs (calling `analyseSearchStrategy` per conversation
   theme; the connector/method registries for availability), coverage, gaps. New.
2. **Connector/method-availability surface for the client** — `isConfigured()` is
   server-only; a small `GET /api/connectors` (or availability baked into the plan
   output). New.
3. **Research Plan UI** — the briefing surface at the top of the Research area:
   objective, methodology recommendations (suitability + requirements), themes,
   per-method configs, gaps; review/edit/approve. New; reuses the strategy + status
   vocabulary.
4. **Search preview** — approved conversation searches shown as **Draft** for
   review/adjust before execution. New surface; the searches reuse the existing
   model + `SearchConfigForm`.
5. **Plan → method configuration orchestration** — loop conversation configs into
   the create-search API + attach; surface survey/document briefs into their create
   flows. New glue over existing primitives.
6. **`research_plan` output_type** — add to `IntelligenceOutputType` + one CHECK
   migration. Trivial.

Not new: the strategist, the connector registry, `research_summaries`/`store.ts`,
the create-search API, the aspect vocabulary, the Evidence Validation gate, and the
entire post-collection confidence engine.

---

## 9. Phasing (each shippable, additive)

1. **The advisor briefing** — research question → plan (objective, methodology with
   suitability + evidence requirements, themes, sources-by-availability, gaps),
   review/edit/approve. Non-conversation methods recommended as guidance. *Delivers
   the "AI research director designs the study" experience immediately.*
2. **Conversation configuration + search preview** — approve → auto-create Draft
   searches (one per theme, pre-loaded strategy) → preview → execute. *Keyword
   search disappears.*
3. **Whole-project method configuration + closing the loop** — plan themes become the
   aspect spine; survey/document briefs wire into their create flows; **Analysis reads
   the plan's `required_evidence` to report methodology execution completeness
   (planned vs collected) alongside research confidence**; add a news connector so
   news moves from gap → configurable.

---

## 10. Invariants

1. **Research decisions to the human, configuration to the machine** — at every step,
   if it's a software configuration decision (keywords, queries, sources, breadth,
   markets, thresholds), Fanometrix decides it automatically; only research decisions
   (the question, the methodology, whether the approach is right) go to the
   researcher. Advanced control is opt-in, never the default path.
2. **The Research Plan is the project's briefing** — it drives every method;
   conversation is one configured method, not the centre.
3. **Methodology first** — decide *how* to answer before *what to query*.
4. **Suitability ≠ confidence, and "confidence" is never used before evidence** — the
   plan speaks only of **method suitability** and **expected contribution** (plus
   role, limitations, expected outputs); "research confidence" is reserved for
   Analysis, computed from evidence *after* collection. The plan carries no
   confidence scores anywhere.
5. **Every method is briefed honestly** — why it's recommended, the role it plays,
   what it will contribute, what it can't establish, and what the client gets if it's
   completed.
6. **Agree the methodology first, then execute** — the plan is the point where the
   client can challenge and refine the approach *before* any evidence is collected,
   the way a research consultancy agrees a brief before fieldwork.
7. **The advisor recommends methods, never invents findings** — and when the chosen
   methods can't answer the question well, it recommends adding another method rather
   than generating more of the same.
8. **The plan sets the evidence yardstick** — its per-theme `required_evidence` is
   what Analysis reads against, enabling Analysis to report **both** research
   confidence **and** methodology execution completeness (planned vs collected), so
   Analysis speaks to the findings *and* the quality of the research process.
9. **Two human gates** — approve the plan, then review each configured method
   (notably the conversation search preview) before anything runs.
10. **Additive & reuse-first** — the existing collect/analyse pipeline is untouched;
    the plan orchestrates existing engines and introduces none.
11. **Honest about availability** — a method with no connector is a recommendation and
    a gap, never an auto-generated dead search.

---

## 11. Open decisions (for you)

1. **Plan optional or mandatory?** Recommended: **plan-first as the default**, manual
   method setup still available.
2. **One Conversation Search per theme, or fewer broader searches?** Recommended:
   **one per theme** (clean theme ↔ strategy ↔ aspect mapping).
3. **How far to configure non-conversation methods in v1?** Recommended: **recommend
   + brief** surveys/documents (link into their create flows); auto-draft them later.
   Conversation is the only fully auto-configured method in v1.
4. **Where does the plan live?** Recommended: **top of the Research area**, driving
   the methods grid — the briefing above the instruments it configures.

---

## 12. On the name

**Keep "Research Plan" — for now.** It is immediately understandable to anyone
commissioning research. "Research Design" and "Research Strategy" are good but more
academic / consultancy-oriented. Build the *experience* first; if it genuinely feels
like a consultancy briefing, the workflow matters far more than the label. Revisit
the name after testing the built experience, not before — a rename is cheap and
reversible; the workflow is the thing to get right.

---

*The Research Plan turns the start of a project from "assemble some methods and type
keywords" into "here is how I would answer this question, which methods it needs and
why, what evidence each must gather to answer well, and where the evidence will fall
short — approve it and I will set up the research." Method suitability is decided
here, up front; research confidence is measured later, by Analysis, from the evidence
itself. It reuses everything already built; it changes where — and how — a project
begins.*
