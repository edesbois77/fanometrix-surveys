# Fanometrix Intelligence Model

> **Status:** **Canonical for Phase 2.** This document defines the intellectual
> operating model Fanometrix converts evidence into intelligence with. It is not
> implementation: it names no table, API, prompt, model or screen. It governs
> everything that happens **after Evidence Validation**.
>
> It **supersedes** `docs/analysis-workspace-blueprint.md`, whose central claims
> (Analysis as the single interpretive layer, no recommendation without an
> approved finding) were never true of the shipped code and should not guide
> Phase 2.
>
> It **extends** the constitution (`docs/research-engine-architecture.md`) above
> the evidence line, exactly as `docs/evidence-lifecycle.md` extends it below the
> evidence line. It **completes** the source-side model designed in
> `docs/evidence-contribution.md`. Where code and this document disagree, this
> document is the intent and the code is the debt.

---

## 1. Purpose and scope

Collection is complete and frozen. Fanometrix can now acquire, validate and
approve evidence from multiple sources with provenance intact. This document
defines what happens next: how validated evidence becomes intelligence an
organisation can act on, deliver to a client, and be accountable for years later.

**In scope:** evidence admissibility, claim formation, findings, assessment,
analyst adjudication, and the contracts by which Reports, Recommendations and
Knowledge consume approved intelligence.

**Out of scope:** acquisition, connectors, deduplication, classification at
collection time, and the evidence review gate. Those are settled and this
document assumes them.

**Not decided here:** data model, interfaces, prompts, sequencing, user
interface design. Section 12 lists what deliberately remains open.

---

## 2. The one idea

The constitution states that research is a question answered by evidence. That is
true and remains the frame. This document states what the answer *is*.

> **An answer is not a summary of evidence. It is a claim the organisation is
> prepared to stand behind, held under a stated warrant, bounded by declared
> conditions, and honest about what would overturn it.**

The unit that carries this is the **Finding**. Everything before a Finding exists
to make findings possible. Everything after a Finding exists to deliver, apply
and remember them. Fanometrix is, structurally, a machine for producing
warranted claims and maintaining them over time.

Two failure modes this model exists to prevent, both of which the platform has
already demonstrated it is capable of:

- **Fluent summarisation mistaken for research.** A well-written paragraph over
  on-topic evidence reads exactly like a finding and is not one. The defence is
  the warrant: a claim must state *why* its evidence supports it, and the
  evidence must be of a kind that legitimately can.
- **Knowledge that accumulates without boundaries.** A claim that was true of one
  audience in one market in one season, recorded without those conditions, becomes
  a falsehood the moment it is reused. The defence is scope and decay.

---

## 3. Reconciling the two decompositions

The canon currently contains two ways to break down a research question, and
Phase 2 must not inherit both.

- The constitution models a **recursive Research Question tree**, and forbids a
  separate "Theme" entity: a theme is a question with a parent.
- `docs/research-project-domain.md` and the Research Design work model
  **Requirements**, each carrying **Information Needs**, an **Evidence Role**, and
  an evidence strategy.

These are the same idea at two resolutions, and the reconciliation is this:

> **A Research Requirement is a child Research Question that has been given an
> evidence contract.** The question states what must be learned. The requirement
> adds why it matters to the decision, what kinds of knowledge would answer it,
> and which methods can supply them.

The recursion the constitution protects is preserved: requirements may themselves
decompose. What the requirement adds is the seam where the commission meets the
evidence, and that seam is where this document does its work. **Information Needs
are the leaves.** They are the smallest unit against which evidence can be judged
admissible and coverage can be computed, and they are therefore the atomic unit
of the intelligence model.

The practical consequence: **"Research Aspect" is retired as an organising
concept.** It was a free-text label that fragmented, could not be keyed to
anything, and privileged whichever source happened to generate it first. Where a
grouping is needed for presentation, it is derived from the requirement
structure, never invented alongside it.

---

## 4. The concept model

Six layers. Each concept is defined by four things: what it is, why it exists,
what it owns, and what it must never do. The prohibitions matter as much as the
definitions; most of them record a failure the platform has already had.

### Layer 1 — The Commission: why we are researching

**Engagement Context**
- *Is:* the client's situation. The decision on the table, the commercial
  objective, the strategic tension, the market, the audience, who commissioned it.
- *Exists because:* research that does not reason from the commission produces
  accurate answers to questions nobody asked.
- *Owns:* the lens every downstream judgement is made through, and the definition
  of what "material" means for this engagement.
- *Never:* supplies evidence, or justifies a claim. Context shapes what is worth
  knowing; it never contributes to whether something is true.

**Research Question**
- *Is:* the atomic unit of research intent. Recursive, per the constitution.
- *Exists because:* everything the platform does must be traceable to something
  the client asked.
- *Owns:* scope of enquiry.
- *Never:* is answered directly by evidence. It is answered by findings, which
  answer its information needs.

**Research Requirement**
- *Is:* a research question with an evidence contract. Carries an Evidence Role
  (direct, comparative, strategic), the information needs that would satisfy it,
  and the kinds of knowledge it needs.
- *Exists because:* the seam between "what we want to know" and "what evidence can
  tell us" must be explicit, or every source is treated as though it can answer
  everything.
- *Owns:* the definition of what would count as an answer, and therefore the
  definition of a gap.
- *Never:* names a specific source, connector or search. Requirements state what
  must be learned; strategies state how.

**Information Need**
- *Is:* a single answerable sub-question. The leaf of the decomposition.
- *Exists because:* admissibility and coverage are only computable at a
  granularity where a piece of evidence can be said to bear on the question or
  not.
- *Owns:* the unit of coverage. A requirement is answered to the degree its needs
  are answered.
- *Never:* is a topic, a keyword or a theme. It is a question with a possible
  answer.

**Hypothesis**
- *Is:* a proposition believed, assumed or asserted before this research, held
  explicitly so it can be tested. Sources include client-supplied research, the
  commissioner's stated assumptions, and prior Knowledge.
- *Exists because:* prior belief enters every engagement whether or not the
  platform models it. Unmodelled, it contaminates evidence. Modelled, it becomes
  testable.
- *Owns:* the mechanism by which client research is treated as a position rather
  than as truth or as raw evidence.
- *Never:* is treated as evidence, and never grounds a finding on its own. A
  hypothesis is a thing to be tested, not a thing that establishes.

### Layer 2 — The Evidence: what we have

**Evidence Item**
- *Is:* one validated, approved, deduplicated unit of observed material with
  intact provenance. A conversation, an article, a survey statistic, a document
  passage, and whatever the fortieth source produces.
- *Exists because:* claims must rest on something specific enough to be checked.
- *Owns:* its own content, provenance and observation history.
- *Never:* carries an interpretation. What an item *means* is a property of the
  claim that cites it, not of the item. The same item may legitimately support
  one claim, qualify a second and contest a third.

**Evidence Role**
- *Is:* why this evidence was collected. Direct (about the subject), comparative
  (about a benchmark), strategic (about the underlying behaviour). Already built.
- *Exists because:* a competitor's conversation and a client's conversation are
  not interchangeable, and conflating them produces the most damaging class of
  error the platform can make.
- *Owns:* attribution rules. What may be said about this evidence, and about whom.
- *Never:* is inferred at synthesis. Role travels from collection, unchanged.

**Source Contract**
- *Is:* a declaration, made once per source type, of the kinds of knowledge it
  can produce and, critically, the kinds it can never establish.
- *Exists because:* with dozens of sources, admissibility cannot be reasoned case
  by case. It must follow from a rule.
- *Owns:* the extension point of the entire platform. A new source is a new
  contract; nothing else in this model changes.
- *Never:* describes technology. A contract is about the nature of the knowledge,
  not the API that delivered it.

**Contribution Kind**
- *Is:* the vocabulary source contracts are written in. Per
  `docs/evidence-contribution.md`: elicited perception, unprompted discourse,
  documented activity, interested claim, expert judgement, established knowledge.
- *Exists because:* the six kinds each carry a prohibition no other kind carries,
  and the prohibitions are the point.
- *Owns:* what a source can and cannot establish.
- *Never:* grows without discipline. A proposed seventh kind must carry a
  prohibition none of the six carries, or it is not earning its place.

**Admissibility**
- *Is:* the verdict produced by projecting one information need through one source
  contract, for one assertion type. Admissible, admissible-with-limits, or
  inadmissible, always with a reason.
- *Exists because:* this is where evidence suitability stops being metadata and
  becomes enforcement. It is the fix for the failure where correctly-acquired,
  on-point news coverage scored zero against a fan-perception need.
- *Owns:* the gate between having evidence and being allowed to reason from it.
- *Never:* silently excludes. An inadmissible item is excluded with a stated
  reason, retained, and visible.

**Evidence Frame**
- *Is:* the admissible set for one information need: every item that may
  legitimately bear on it, each carrying what it may be used to say.
- *Exists because:* reasoning must start from a bounded, justified set, not from
  "all the evidence".
- *Owns:* the input to claim formation, and the honest denominator for coverage.
- *Never:* is a quality ranking of evidence in general. The same item is framed
  differently for different needs. There is no such thing as good evidence, only
  evidence that is good *for something*.

### Layer 3 — The Claim: what we say

**Assertion Type**
- *Is:* the kind of claim being made. Descriptive, comparative, magnitude,
  temporal, causal, predictive, or absence.
- *Exists because:* it is the hinge that makes admissibility computable. A causal
  claim cannot be warranted by unprompted discourse alone; a magnitude claim
  cannot be warranted by conversation volume; an elicited-perception source cannot
  establish observed behaviour.
- *Owns:* half of the compatibility matrix. Assertion type against contribution
  kind determines what may be said, from what.
- *Never:* is chosen for rhetorical convenience. Downgrading a causal claim to
  descriptive to make weak evidence sufficient is the failure this concept exists
  to make visible.

**Claim**
- *Is:* a proposition, with an assertion type, about a declared scope. Abstract.
  It may be true or false, held or discarded, believed or tested.
- *Exists because:* the platform must be able to talk about a proposition before
  it is warranted, and about propositions it decided not to hold.
- *Owns:* the proposition itself, separate from the organisation's position on it.
- *Never:* appears downstream on its own. Only findings leave the analysis layer.

**Scope**
- *Is:* the boundary conditions under which a claim holds. Audience, market,
  period, and any qualifying conditions.
- *Exists because:* an unscoped claim is unusable at knowledge scale and dangerous
  when reused. "Fans think X" is not intelligence; "among UK match-going fans in
  the 2026 season, X" is.
- *Owns:* comparability. Two claims can only be corroborated or contradicted if
  their scopes are compatible.
- *Never:* is optional, and never defaults to silence. An unstated scope is
  interpreted as universal, which is nearly always false.

**Temporal Validity**
- *Is:* the declared perishability of a claim. Structural, periodic, or
  point-in-time.
- *Exists because:* knowledge that cannot expire becomes a liability. The platform
  must know which of its claims are still claims.
- *Owns:* decay behaviour in Knowledge.
- *Never:* is retrofitted. A claim recorded without perishability cannot later be
  aged correctly, so this is declared at formation or not at all.

**Warrant**
- *Is:* the explicit statement of why these grounds support this claim.
- *Exists because:* it is the difference between citation and argument. Evidence
  attached to a sentence is not a reason; a warrant is.
- *Owns:* what an analyst adjudicates and what a client challenges.
- *Never:* restates the claim, and never restates the evidence. If the warrant can
  be deleted without loss, the claim was not argued.

**Citation**
- *Is:* the binding of one evidence item to one claim, carrying a stance
  (establishes, illustrates, qualifies, contests), an admissibility verdict, an
  evidential weight, a captured snapshot, and who or what asserted the link.
- *Exists because:* stance is a property of the relationship, not of the evidence.
  The same item changes stance when a claim is reframed.
- *Owns:* traceability, and the recomputation of every derived assessment.
- *Never:* is stored as three separate lists of supporting, conflicting and
  contextual evidence. That shape cannot survive a reframe.

**Finding**
- *Is:* a claim the organisation has formed, warranted, assessed, adjudicated and
  is prepared to stand behind. Claim plus grounds plus warrant plus assessment
  plus governance plus history.
- *Exists because:* it is the single unit of intelligence. Every downstream
  artefact consumes it and nothing else.
- *Owns:* the answer to an information need, and the organisation's accountability
  for it.
- *Never:* is a piece of generated text. The statement is one attribute. Prose is
  rendered from a finding; a finding is never parsed from prose.

**Null Finding**
- *Is:* a finding whose claim is that the evidence does not answer the need, with
  grounds (what was examined), a warrant (why it is insufficient), and the
  collection that would close it.
- *Exists because:* absence must be reportable, trackable and deliverable. "We do
  not yet know" is a research output, not a hole.
- *Owns:* the honest denominator of coverage, and the loop back to collection.
- *Never:* is treated as a failure of the analysis. A null finding is a
  successful outcome of a research process that refused to invent.

### Layer 4 — The Assessment: how well we say it

All assessments are **derived**. Every one of them is a pure function of the
grounds, recomputable at any time from the citations. Analysts may override, and
the derived value is retained beside the override permanently.

**Evidence Strength**
- *Is:* how good the grounds are. A property of the evidence base.
- *Exists because:* the quality of what we have and the certainty of what we
  conclude are different questions, routinely collapsed.
- *Owns:* the evidential half of trust.
- *Never:* is conflated with confidence. Strong evidence can support a claim
  weakly, and thin evidence can support a narrow claim decisively.

**Confidence**
- *Is:* how sure we are of the claim. A property of the inference. Level, plain
  rationale, factor breakdown, and what would change it.
- *Exists because:* every claim must carry its own qualifier, and that qualifier
  must be explicable.
- *Owns:* the inferential half of trust, and the bridge back to research ("this
  becomes High with survey corroboration").
- *Never:* is asserted by whatever generated the claim, and never a simple
  average. Contradiction and gaps lower it; independent corroboration raises it.

**Independence**
- *Is:* how many genuinely separate lines of evidence support a claim, as distinct
  from how many items.
- *Exists because:* fifty syndications of one wire story is one line of evidence.
  Volume masquerading as corroboration is the most common way confidence inflates.
- *Owns:* the strength of corroboration claims.
- *Never:* counts items when it should count sources of knowledge.

**Coverage**
- *Is:* the proportion of a requirement's information needs that have findings,
  and at what confidence.
- *Exists because:* the honest question is not "what did we find" but "what did we
  set out to learn, and how much of it do we now know".
- *Owns:* the analyst's unit of work, the report's completeness declaration, and
  the definition of a gap.
- *Never:* is inferred from missing source types. A gap is an unanswered need, not
  an absent source.

**Position**
- *Is:* this finding's relation to a named prior belief or hypothesis. Confirms,
  extends, qualifies, contradicts, or novel.
- *Exists because:* novelty is meaningless in the abstract and meaningful against
  a stated prior. It is also how client research earns its place in the model.
- *Owns:* the link between new intelligence and existing knowledge.
- *Never:* is a score. Position always names the prior it is relative to.

### Layer 5 — The Governance: who says it

**Adjudication**
- *Is:* the analyst's act of judgement on a candidate finding. Accept, reframe,
  narrow, split, merge, reject, request evidence, defer.
- *Exists because:* research judgement is the product. Without it the platform is
  a summarisation service with a review queue.
- *Owns:* the transition from machine-formed to organisationally held.
- *Never:* is limited to accept and reject. An adjudicator who cannot author,
  reframe or demand more evidence is a labeller.

**Approval**
- *Is:* the research judgement that the organisation stands behind a claim.
  Accountable to a named person.
- *Exists because:* someone must be answerable for every claim delivered.
- *Owns:* the gate every downstream consumer reads.
- *Never:* is implicit, inherited, or granted by default. Unadjudicated findings
  are invisible downstream, so inattention is safe.

**Publication**
- *Is:* the commercial judgement that an approved claim is released into a
  deliverable.
- *Exists because:* approved and delivered are different decisions, sometimes made
  by different people. Collapsing them means the only way to withhold something is
  to refuse to approve it, which corrupts the research record.
- *Owns:* the client-facing boundary.
- *Never:* alters a claim. Publication selects and presents; it does not decide
  truth.

**Challenge**
- *Is:* the event where new evidence bears materially on a standing finding.
  Outcomes: reaffirmed, qualified, superseded, retired.
- *Exists because:* evidence is continuous and append-only. A finding is not a
  conclusion, it is a position currently held.
- *Owns:* the maintenance of intelligence over time, and the challenge history
  that makes a well-tested claim demonstrably stronger than a fresh one.
- *Never:* resolves automatically. A challenge proposes; an analyst adjudicates.

**Supersession**
- *Is:* the replacement of a finding by a later version, with lineage retained.
- *Exists because:* delivered intelligence must remain what was delivered, and
  history must remain readable.
- *Owns:* immutability.
- *Never:* deletes. Anything that cited a version keeps citing that version.

### Layer 6 — The Consumers: what we do with it

**Report**
- *Is:* a curated, arranged, audience-appropriate presentation of published
  findings.
- *Exists because:* intelligence must be delivered in a form a client can read and
  act on.
- *Owns:* selection, sequence, emphasis, register, and the declaration of what it
  did and did not answer.
- *Never:* interprets. A report may render evidence already cited by a finding it
  presents; it may never introduce evidence, state a figure, or make a claim that
  is not carried by a finding.

**Recommendation**
- *Is:* a proposed action, grounded in at least one approved finding, serving the
  decision named in the engagement context.
- *Exists because:* a claim about what is true and a claim about what to do have
  different authors, different risks and different approvals.
- *Owns:* the move from knowing to acting, and its own accountability.
- *Never:* exists without grounds, and never carries confidence exceeding its
  weakest supporting finding. When a supporting finding is superseded or retired,
  every dependent recommendation is flagged for re-adjudication.

**Knowledge**
- *Is:* the organisation's durable, scoped, decaying store of approved findings,
  and the priors and hypotheses it emits back into new research.
- *Exists because:* a consultancy's asset is what it knows across engagements, not
  what it produced in one.
- *Owns:* accumulation, comparability, decay, and confidentiality classification.
- *Never:* stores a claim without its scope and temporal validity, and never
  serves a client-confidential finding into another organisation's research.

---

## 5. The reasoning model

### What changes from the proposed flow

The proposed sequence is close. Four corrections, each structural.

**Evidence Contribution is not a stage.** It is a projection performed per
information need, not a step evidence passes through once. The same item is
admissible for one need and inadmissible for another. Modelled as a stage, it
becomes a global quality score and the whole point is lost. The stage is
**Framing**, and its output is one Evidence Frame per need.

**Assertion Type is missing and belongs before disconfirmation.** A candidate
claim is not a proposition alone; it is a proposition plus an assertion type plus
a provisional scope. This has to be decided early, because it determines what
counts as disconfirming evidence and which citations are admissible.

**Analyst Review is two acts and several exits.** Adjudication is research
judgement; disposition is approval and publication. And review is not a
checkpoint on a line: it exits backwards to collection (request evidence), to
formation (split, reframe), and to other findings (merge).

**The model is not a line, it is a line with three loops.** Drawn as a pipeline
it looks like a batch process that runs once. It is a continuously maintained
knowledge base. The loops are the part that makes it a platform rather than a
report generator.

### The model

```
                 ┌──────────────────────── KNOWLEDGE ◄──────────────────┐
                 │   priors · hypotheses · benchmarks · prior findings   │
                 ▼                                                       │
  COMMISSION                                                             │
     Engagement Context                                                  │
            ↓                                                            │
     Research Question                                                   │
            ↓                                                            │
     Research Requirements          (question + evidence contract)        │
            ↓                                                            │
     Information Needs              (the leaves: the unit of coverage)    │
            │                                                            │
            ▼                                                            │
  FRAMING                                                                │
     per need, project every validated evidence item through its          │
     source contract for the intended assertion type                      │
            ↓                                                            │
     EVIDENCE FRAME                 admissible · with-limits ·            │
                                    inadmissible-with-reason              │
            │                                                            │
            ▼                                                            │
  FORMATION                                                              │
     candidate claims: proposition + assertion type + provisional scope   │
     competing readings, never one. Includes the null claim.              │
            │                                                            │
            ▼                                                            │
  DISCONFIRMATION                                                        │
     test each candidate against the WHOLE frame for evidence that        │
     weakens, bounds or refutes it. Record what was searched.             │
            │                                                            │
            ▼                                                            │
  WARRANTING                                                             │
     bind each citation with stance + admissibility. Citations the        │
     source contract cannot support are rejected, with reason, retained.  │
            │                                                            │
            ▼                                                            │
  ASSESSMENT                       derived, recomputable:                 │
     evidence strength · confidence · independence · coverage · position  │
            │                                                            │
            ▼                                                            │
     CANDIDATE FINDING                                                    │
            │                                                            │
            ▼                                                            │
  ADJUDICATION                                                           │
     accept · reframe · narrow · split · merge · reject ·                 │
     author · request evidence · mark contested                          │
            │                          │                                 │
            │                          └──► COLLECTION LOOP ─────────────┤
            │                               (a need that cannot be       │
            │                                warranted becomes a         │
            ▼                                collection requirement)     │
  DISPOSITION                                                            │
     approve  (research judgement, named, accountable)                    │
            ↓                                                            │
     publish  (commercial judgement, separate act)                        │
            │                                                            │
            ▼                                                            │
     STANDING FINDING ──┬──► REPORTS                                      │
            ▲           ├──► RECOMMENDATIONS                              │
            │           └──► KNOWLEDGE ──────────────────────────────────┘
            │
     CHALLENGE LOOP
     new evidence entering any frame is tested against the standing
     findings that frame supports: reaffirm · qualify · supersede · retire
```

### The three loops

**The Knowledge loop.** Knowledge is a source as well as a sink. It supplies
priors, hypotheses and benchmarks into formation, and receives approved findings
back. Without this the platform starts every engagement ignorant and a
consultancy's accumulated intelligence is worth nothing.

**The Collection loop.** A need that cannot be warranted from the current frame
produces a null finding and a collection requirement. This is how Analysis drives
Research Design instead of merely consuming it, and it is the most valuable
consultancy behaviour in the model: "I cannot establish this, here is what would."

**The Challenge loop.** Evidence is append-only and continuous. New evidence is
tested against the standing findings it bears on. A finding is a position
currently held, not a conclusion reached.

---

## 6. Governing principles

These hold regardless of implementation. Each names the failure it prevents,
because a principle whose failure mode cannot be stated is decoration.

| # | Principle | The failure it prevents |
|---|---|---|
| 1 | **Interpretation happens exactly once.** Claims are formed in Formation and nowhere else. Every other layer selects, presents or applies. | Two competing interpretations of the same project, shown to the same client. The current architecture's central defect. |
| 2 | **A Finding is a governed object, not text.** Structured, addressable, versioned, adjudicable. | Findings that cannot be approved, related, superseded or cited, because they are positions in an array. |
| 3 | **Nothing downstream may claim what is not a Finding.** Reports may render evidence a presented finding cites; never introduce evidence, figures or claims of their own. | Reports that re-analyse, which is what happens today. |
| 4 | **Confidence is derived, never asserted.** By a process independent of the one that formed the claim. Overrides are visible and the derived value is kept. | Confidence as a function of the generator's fluency rather than the evidence. |
| 5 | **Evidence suitability is enforced, not advised.** Admissibility is a gate: assertion type against contribution kind. | On-point evidence scoring zero, and off-contract evidence establishing things it cannot. |
| 6 | **Every claim declares its scope.** Audience, market, period, conditions. Unstated scope reads as universal, and is nearly always false. | Cross-project knowledge reuse that turns a local truth into a general falsehood. |
| 7 | **Every claim declares its perishability.** Structural, periodic, or point-in-time, at formation. | A knowledge base that cannot tell which of its claims are still claims. |
| 8 | **Disconfirmation is mandatory.** Every candidate is tested against its full frame for counter-evidence, and what was searched is recorded. | Advocacy dressed as synthesis. A claim formed from a cluster has already selected for agreement. |
| 9 | **Corroboration requires independence.** Repetition is not agreement; distribution is not corroboration. | Confidence inflated by syndication, volume, or one source quoted many times. |
| 10 | **The null result is a finding.** Absence is formed, warranted, adjudicated, reportable and deliverable. | Gaps that exist only as UI noise, and reports that quietly omit what was not answered. |
| 11 | **Quantification is computed, never narrated.** Any figure in a claim is calculated from its cited set. | Plausible arithmetic across differently-sized groups, which the platform has already produced and shipped. |
| 12 | **Nothing is deleted; claims are superseded.** Delivered intelligence stays as delivered; lineage is retained. | Reports that silently change beneath a client, and an unauditable record. |
| 13 | **Every claim has a named owner.** Approval is accountable to a person, in a capacity, on a date. | Intelligence nobody is answerable for. |
| 14 | **Knowledge decays.** Accumulation without expiry produces a swamp. | A five-year-old perception claim serving as a current one. |
| 15 | **Client research is a hypothesis, not evidence and not truth.** Prior belief is stated so it can be tested, and a failed hypothesis produces a finding. | Client assumptions entering the evidence pool and confirming themselves. |
| 16 | **Sources declare what they cannot establish.** The contract is the extension point; the connector is not. | Every new source requiring changes to the reasoning layer. |
| 17 | **The model is not the interface.** Rigour is internal; the analyst surface is plain. | An intellectually correct platform nobody can use. |
| 18 | **Every derived value is recomputable.** Assessments are pure functions of grounds. Store judgements you can regenerate, and overrides you cannot. | Historic intelligence that cannot be re-graded when the rubric improves. |

---

## 7. The relationships

### The map

```
   Engagement Context
        │ frames
        ▼
   Research Question ──decomposes into──► Research Requirement
                                                │ declares
                                                ├──────────────► Information Need
                                                │                      │
                                                └─ needs ──► Contribution Kinds
                                                                       │
   Source ──declares──► Source Contract ──supplies──► Contribution Kinds
        │                                                              │
        │ produces                          projection of need         │
        ▼                                   through contract           │
   Evidence Item ─────────────────────────────────┴──────► ADMISSIBILITY
        │ carries Evidence Role                                    │
        │                                                          ▼
        └──────────────────────────────────────────────► EVIDENCE FRAME
                                                                   │
                                                                   ▼
   Hypothesis ──is tested by──► FINDING ◄──grounded in── Citation ──cites──► Evidence Item
        ▲                        │  │                       └─ carries stance
        │                        │  │
        │                        │  └── answers ──► Information Need ──rolls up──► Coverage
        │                        │
        │                        ├── relates to ──► FINDING
        │                        │   (corroborates · contradicts · qualifies ·
        │                        │    explains · depends on · supersedes ·
        │                        │    merged from · split from)
        │                        │
        │                        ├── presented by ──► Report
        │                        ├── grounds ────────► Recommendation ──serves──► Decision
        │                        └── retained by ────► Knowledge
        │                                                  │
        └──────────────── emits priors ────────────────────┘
```

### The rules that carry weight

**A Finding is anchored to exactly one requirement, and may answer several of its
information needs.** It may be *cited by* another requirement's coverage, but it
has one home. Multiple anchors make coverage ambiguous and accountability
diffuse.

**Evidence supports findings, never requirements.** Evidence has no meaning until
a claim cites it. A requirement is answered by findings, not by having evidence
attached to it.

**Coverage is computed at the need, rolled up to the requirement, rolled up to the
question.** At no level is it asserted.

**A finding-to-finding contradiction requires the same assertion type over
compatible scope.** Different scope is a boundary condition, not a contradiction.
This single rule removes most false contradictions.

**Merging is a claim operation.** Two findings merge only if assertion types match
and scopes are compatible. Grounds become the union; confidence is recomputed and
may fall, if the union exposes conflict neither parent saw.

**Splitting is compulsory when a statement makes two separately falsifiable
assertions.** A conjunction that can be half true is malformed.

**A recommendation's confidence is capped by its weakest supporting finding**, and
its validity is contingent on them. Supersession of a ground flags the
recommendation.

**Knowledge relationships cross projects, clients and years.** This is only safe
because scope, assertion type and temporal validity are mandatory. They are the
price of admission to cross-project reuse.

---

## 8. Three audiences, one model

The largest risk to this design is not that it is wrong. It is that its rigour
leaks into the interface and produces a platform only its author can operate.
The internal model is deliberately dense. **The surfaces are projections of it,
and each drops most of it.**

| Internal concept | The analyst sees | The client sees |
|---|---|---|
| Information Need | "What we set out to learn" | The question, in the report's contents |
| Evidence Frame | "Evidence available for this question" | Nothing |
| Admissibility verdict | "This source can't answer this" with a one-line reason | Nothing, unless it explains a gap |
| Contribution Kind | Never named. Surfaced only as "what this source can tell you" | Never |
| Assertion Type | Never named. Surfaced only when it blocks something: "this is a causal claim, conversation alone will not support it" | Never |
| Warrant | "Why this evidence supports this" | "Why we believe this" |
| Citation stance | Supports · qualifies · contests, as three visual groupings | Supporting and conflicting evidence, expandable |
| Evidence Strength | Strength plus independent lines | "Based on 4 independent sources" |
| Confidence | Level, plain rationale, factor breakdown, what would raise it | Level and one sentence |
| Independence | "3 independent lines, 40 items" | Implicit in the strength phrasing |
| Coverage | The requirement board: answered, partial, open | "What this research answered, and what it did not" |
| Null Finding | "Not answerable yet" with a one-click collection action | "We could not establish this. Here is what would." |
| Scope | An editable boundary on the claim | Rendered inside the sentence: "among UK match-going fans this season" |
| Temporal Validity | A perishability setting, mostly pre-filled | A currency date |
| Challenge history | "Tested 3 times, held twice, qualified once" | "Reaffirmed, June 2027" |
| Supersession | Version history and diff | "Updated" with a date, and the prior version still readable |
| Position vs prior | "Contradicts the client's 2025 study" | "This differs from earlier research, and here is why" |

### The design rules that follow

**The analyst's unit of work is the requirement, not the finding.** A findings
inbox is quality assurance. A requirement board is research. The screen answers
three questions and no more: *what do we know, how well do we know it, what is
still missing.* Everything else is progressive disclosure, one click from a
claim.

**The analyst never types the model's vocabulary.** They accept, reframe, narrow,
split, merge, reject, or ask for more evidence. The model records assertion
types, admissibility verdicts and warrants as a consequence of those acts, and
surfaces them only when they block something or explain something.

**The client never learns our vocabulary at all.** They see claims, why we believe
them, how sure we are, what the evidence is, what the boundaries are, and what we
could not establish. The last of those is the trust differentiator and should be
prominent, not buried.

**There is a fourth audience, and for it the model *is* the interface.** AI agents
consuming Fanometrix intelligence should receive the full internal structure:
assertion type, scope, warrant, citations with stance, derived assessments, and
relationships. Humans get projections; agents get the model. This is the reason
the internal model must be complete and explicit even where no screen shows it.

---

## 9. Behaviour at scale

The conditions this model is designed to remain correct under, and what each one
requires.

**Dozens of evidence sources.** Nothing in the model names a source type. Sources
declare contracts; claims cite evidence abstractly; admissibility follows from the
compatibility matrix. Adding a source is a contract, never a change to reasoning.

**Multiple analysts.** Authorship, review and approval are distinct roles, and
disagreement is a state with a path, not an error. This is modelled from the
start even while usage is single-analyst, because retrofitting authorship into an
approval-only model is not a migration, it is a rewrite.

**Thousands of research projects.** Findings must be comparable across
engagements, which is possible only because assertion type, scope and temporal
validity are mandatory. Comparability is not a feature added later; it is a
consequence of fields declared at formation.

**Millions of evidence items.** Reasoning never reads the evidence base. It reads
a frame: the admissible set for one need. Framing is a projection, not a scan,
and its cost scales with the number of needs and sources rather than with the
number of items.

**Long-term organisational knowledge.** Knowledge is curated, not accumulated. It
decays by declared perishability, strengthens by challenge, and is partitioned by
confidentiality class: client-confidential, house, and benchmark, with different
reuse rights.

**AI agents interacting with findings directly.** Every claim is addressable,
every assessment recomputable, every citation traceable, every relationship typed.
An agent must be able to ask what we know about X, at what confidence, on what
grounds, within what boundaries, and when it was last tested, and receive a
structured answer.

### Hazards to hold in view

- **Knowledge contamination.** A finding true of one client's audience presented
  as general truth is the most likely serious failure at scale. Scope plus
  confidentiality class is the mitigation, and both must be enforced at the
  Knowledge boundary rather than trusted to good practice.
- **Claim drift.** A report's audience-appropriate rewording must stay bound to
  the canonical claim, or the same finding says different things in different
  deliverables.
- **Synthetic depth.** Findings grounded in findings can drift several inferential
  steps from evidence while still appearing well-cited. Confidence caps help; a
  depth limit is probably also needed.
- **Taxonomy ossification.** Assertion types and contribution kinds will need
  revision. They must be versioned, and historic findings must remain
  interpretable under the taxonomy they were formed with.
- **The cost of disconfirmation.** It is the most expensive step and the one that
  makes the difference between research and summarisation. It will repeatedly look
  like the obvious economy. It is not.

---

## 10. Invariants

The testable list. Work is measured against these.

1. Interpretation occurs only in Formation. No other layer forms a claim.
2. No downstream artefact asserts anything not carried by a Finding.
3. A report may render only evidence cited by a finding it presents.
4. Every claim states its assertion type, scope and temporal validity.
5. Every claim states its warrant, distinct from its statement and its evidence.
6. Every citation carries a stance and an admissibility verdict.
7. Inadmissible evidence is excluded with a stated reason and retained.
8. Every candidate is disconfirmed before it is assessed, and the search is recorded.
9. Confidence and strength are derived by a process independent of formation.
10. Every figure in a claim is computed from that claim's cited set.
11. Coverage is computed at the information need and never asserted.
12. A need that cannot be warranted produces a null finding and a collection requirement.
13. Approval is a named, accountable act; unadjudicated findings are invisible downstream.
14. Approval and publication are separate acts.
15. Findings are superseded, never deleted or mutated; delivered artefacts are version-pinned.
16. Contradiction requires matching assertion type and compatible scope.
17. Corroboration requires independent lines of evidence.
18. Every recommendation cites at least one approved finding and inherits a capped confidence.
19. Knowledge stores no claim without scope, perishability and confidentiality class.
20. Prior belief enters as a hypothesis, never as evidence.

---

## 11. What this model retires

Named explicitly, so Phase 2 does not carry them forward by inertia.

- **Research Aspect as an organising concept.** A free-text label that fragmented,
  keyed to nothing, generated by whichever source ran first. Replaced by the
  requirement and its information needs.
- **Source-organised analysis.** Survey findings, conversation findings and
  document findings as separate readers. Source is provenance and diversity, never
  an organising axis.
- **The per-source intelligence layer as the input to reports.** Reports read
  approved findings, not per-source summaries.
- **Key Findings as a second, parallel findings product.** One findings layer.
- **Recommendations as prose inside reports.** Recommendations are objects with
  grounds and approval.
- **Analysis as a leaf node.** Analysis is the interpretive layer everything
  downstream depends on, or it is nothing.

---

## 12. What this document deliberately does not decide

No data model, no interfaces, no prompts, no screens, no sequencing. Those follow
and must conform to this.

Four open decisions that change the shape of what follows, and should be settled
before design proceeds:

1. **Assertion types: which, and how many?** Seven are proposed. The taxonomy is
   load-bearing and will be wrong in its first version. Start small, version it,
   expect one revision.
2. **Is a null finding produced for every unanswered need, or only where evidence
   was examined and found wanting?** The first is complete and noisy; the second
   is useful and incomplete. The working default is the second, with unexamined
   needs shown as coverage gaps rather than findings.
3. **Does knowledge decay ship in the first release?** The *declaration* of
   temporal validity must, because it cannot be retrofitted. The decay behaviour
   itself can wait.
4. **Where does the compatibility matrix live conceptually?** Assertion type
   against contribution kind, with prohibitions written out, is the artefact that
   determines what the platform can legitimately claim. It should be authored and
   agreed as its own document before anything is built against it.

---

## 13. Position in the canon

| Document | Governs |
|---|---|
| `docs/principles.md` | **Above everything.** The beliefs every other document implements |
| `docs/research-engine-architecture.md` | The constitution: the recursive Research Question model |
| `docs/research-project-domain.md` | The engagement and its approved Research Design |
| `docs/evidence-lifecycle.md` | Below the evidence line: the append-only evidence base |
| `docs/evidence-validation-blueprint.md` | The approval gate this document begins after |
| `docs/evidence-contribution.md` | The source-side contract this document enforces |
| **`docs/intelligence-model.md`** *(this document)* | **Above the evidence line: how evidence becomes intelligence** |
| `docs/compatibility-matrix.md` | What each kind of evidence may establish, and what it may never |
| `docs/analysis-workspace-blueprint.md` | **Superseded.** Retained for history only. |

---

*Collection answered the question of how Fanometrix knows things. This document
answers the question of what Fanometrix may say about them, on what grounds, with
what confidence, within what boundaries, and for how long. The Finding is the
unit that carries all five. Everything before it exists to make it possible;
everything after it exists to deliver, apply and remember it.*
