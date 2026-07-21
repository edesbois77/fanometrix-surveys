# Planning — the Research Design

**Status:** Proposed product specification, pressure-tested — for review before build.
Built against `docs/research-project-domain.md` (the domain model) and follows the
pattern of `docs/overview-page.md`. No implementation here.

**Related canon:** `docs/research-project-domain.md`, `docs/overview-page.md`,
`docs/research-methodology.md`, `docs/conversation-advisor.md`,
`docs/existing-intelligence.md`.

---

## 1. Principle

Planning produces one artefact — **the Research Design** — and it must read like a
**consultancy proposal**, not a configuration screen. It answers one question:

> *Based on everything we now understand, how should we answer this business
> question — and why is this the right programme?*

The user must leave thinking **"I agree this is the right research programme,"**
never *"I've configured a research tool."*

**The load-bearing boundary — Planning owns methodology, not instruments.**
Planning decides *which methods answer which needs, and why*, and *what each must
achieve*. It does **not** touch the survey's questions, the conversation search's
keywords/platforms/strategy, or any fielding. Those belong to the specialist
methods' **execution** (Implementation), which consume the *approved* design. The
moment Planning starts asking the user to write a question or pick a platform, it
has become the tool it was meant to replace. This boundary is the whole game.

## 2. Continuity — Planning does not start cold

Planning is reached only after the user has, in the Overview: confirmed *Our
Understanding*, seen *Existing Intelligence*, read *Confidence* and *What We Still
Need To Learn*, and accepted *Fanometrix's Recommendation* (Focused or Full
Research). Planning **inherits all of it**, and its premium feel comes from
visible continuity:

- The Overview's **Frontier ("what we still need to learn")** becomes the seed of
  the **Information Needs**. The diagnosis becomes the treatment plan.
- The Overview's **Existing Intelligence** becomes **coverage** — what we already
  know and therefore will *not* re-collect.
- The Overview's **Recommendation** (Focused vs Full) frames the programme's
  **scope**.
- The Overview's **readiness gap** is the programme's **success target**: research
  succeeds when it closes the gap to "Ready to Decide."

Planning should feel like the same consultant continuing the same conversation —
not a new tool opening a blank plan.

## 3. The narrative arc

> **Approach → Learning Agenda → How We'll Answer → What It Contributes → Success → Scope → Commitment**
>
> "Here's the programme we propose and why → here's exactly what we must learn →
> here's how each question gets answered, and what we already know → here's what
> you'll get and how rigorous it'll be → here's what 'done' looks like → here's
> what we're deliberately *not* doing → shall we proceed?"

This mirrors the Overview's recommendation-first discipline: **lead with the
proposed approach (judgment), not the list of needs (working).**

## 4. Page anatomy

### A. Continuity header
The engagement's letterhead, carried from the Overview, plus the **business
question** and the **readiness gap this programme closes** ("Today: not ready to
decide — two unknowns. This programme resolves them."). Context, not configuration.

### 1 · The Proposed Approach *(leads the page — the proposal's executive summary)*
A short consultative statement, in prose: *"To answer [business question], we
propose a [focused/full] research programme built around [N] information needs,
answered primarily through [methods]. We already have strong evidence on [X], so
the programme concentrates on [the genuine gaps]."* This is the recommendation the
rest of the page justifies. It is where the researcher decides "yes, this is the
right shape" before reading any detail.

### 2 · The Learning Agenda — What we need to learn, and why it matters
The **Information Needs**, grouped by **Research Aspect** (the durable organising
theme; aspects are primary UX, needs nested — as in the Conversation Advisor).
Seeded from the Overview's Frontier. Each need shows the sub-question **and why it
matters** — its explicit link to the business question. This is where the
Overview's gaps become formalised, stable-identity Information Needs (domain model
seam 3). Method-agnostic: a need is a question about the world, never a method.

### 3 · How We'll Answer Each — Method Assignment + coverage
The heart. For each Information Need, three things together:
- **What we already know** — existing coverage from Existing Intelligence (with
  provenance), so the client sees we won't pay to re-learn it.
- **The genuine gap** — what remains to be collected for this need.
- **The method(s) assigned** to close it, each with a **method-fit verdict**
  (Primary / Supporting / Conditional / Not suitable) and a **plain rationale**
  for *why this method suits this need*. This is the distributed-advisor reasoning
  (each specialist's assessment of the shared need), synthesised into one
  programme — but the researcher sees "how we'll answer this," never "configure a
  survey."

### 4 · The Programme's Logic — sequencing & dependencies
A research programme has an *order*, not a flat checklist. Where **Conditional**
method-fits exist (a method becomes useful only after another establishes the
vocabulary/structure — e.g. conversation surfaces drivers → survey quantifies →
conversation re-listens), the design shows the **phasing**. This is what makes it
read as a designed programme rather than a list of methods, and it's a strong
premium signal.

### 5 · What Each Method Contributes *(expected contribution — NOT promised confidence)*
What each method will *establish*, and to what **rigor / scope** (e.g. "a survey
will quantify willingness-to-pay across the target audience; conversation evidence
will surface the *why* qualitatively"). **This is a design expectation, never a
confidence claim** — the domain model reserves *confidence* for Analysis, measured
from real evidence. Expected contribution is the **yardstick the design sets**;
Analysis later fills it with measured confidence (domain model §5, authored vs
measured). This is the correct, honest reframe of "what confidence will each
method contribute."

### 6 · What Success Looks Like
Explicit success criteria — per need (*what evidence would satisfy it*) and for the
programme (*we can make the business recommendation with confidence*). This closes
the loop with the Overview: the programme succeeds when it moves the engagement
from "not ready" to **Ready to Decide** on the business question. Defining "done"
up front is a senior-consultancy hallmark most research tools omit.

### 7 · Deliberate Scope — what we're *not* doing, and why *(restraint)*
The mirror of Fanometrix's Recommendation. The design states its **boundaries**:
needs already answered by existing intelligence (no collection), methods
considered and **not** proposed (not suitable / not worth the cost), and anything
out of scope. A proposal that says *"we could survey this, but it won't materially
improve the recommendation, so we're not proposing it"* protects the client's
budget and builds more trust than one that proposes everything.

### 8 · Approve the Research Design — the commitment
The single closing action: **Approve the Research Design.** Light human-confirmed
gate (the researcher can add/remove/reprioritise needs, challenge method
assignments, and edit before approving — a working surface, not a signature). On
approval the design becomes the **active, versioned** methodology (domain model
§7); the specialist methods consume it via the resolver and **execution begins**.
Approval is the hand-off from Planning into Implementation. The feeling at this
moment is *"I agree this is the right research programme."*

## 5. Interaction & trust rules

- **Proposal-document feel** — reads top-to-bottom like a considered proposal, one
  artefact, one commitment; not sectioned config with many save buttons.
- **Every method choice is justified.** No unexplained assignment ever appears.
- **Evidence-aware** — coverage from Existing Intelligence is visible on every
  need; the programme is scoped to genuine gaps.
- **Honest about limits** — expected contribution is bounded and truthful; scope
  boundaries are explicit.
- **Edit = challenging a colleague's proposal**, not filling a form. Reprioritise,
  reassign, remove — then approve.

## 6. Domain-model faithfulness

- Planning **writes the Research Design** (authored content: research question,
  Information Needs, Method Assignment, expected contribution, success criteria,
  scope boundaries).
- **Confidence is measured later** (Analysis). Planning sets *expected
  contribution* — the target the measured confidence is scored against. Planning
  must never present a confidence number.
- **Information Needs are formalised here with stable ids** (seam 3), from the
  Overview's informal Frontier. This is where the durable unit is born.
- **Approval → versioning.** The approved design is an immutable version; later
  edits fork a new draft that must be re-approved (§7).
- **On approval, methods consume the design** via `resolveInformationNeeds` and
  begin executing. Planning proposes and owns the methodology; the specialists
  execute it.
- **Method-neutral to the researcher**; the distributed-advisor (per-method) logic
  is the substance underneath, surfaced only as rationale.

## 7. What moves elsewhere (challenge the boundaries)

- **Implementation / Execution owns instruments & fielding:** survey questions,
  conversation search strategy/keywords/platforms, sample recruitment, collection
  runs. Planning names the method and its objective; it never configures it.
- **Analysis owns measured confidence and findings.** Planning owns expectations.
- **Commercial (cost, timeline, effort):** light-touch at most for v1 (a Focused
  vs Full *scope* indication is enough); a detailed plan/Gantt is out of scope and
  risks turning the proposal into project management.

## 8. Pressure-test — challenges to the proposed structure

1. **Lead with the approach, not the needs.** Opening on "here are the information
   needs" is the analyst showing working. Open on the **proposed programme** (§4.1);
   the needs justify it beneath. (Same inversion as the Overview's recommendation.)
2. **"Confidence each method will contribute" → "Expected contribution."** Promising
   confidence at Planning violates the authored-vs-measured discipline and the
   never-fabricate ethos. Reframe as expected evidentiary contribution + rigor, the
   yardstick Analysis measures (§4.5). *This is the most important correction.*
3. **Make coverage/efficiency a first-class element**, not a footnote. "What
   evidence already exists" per need — and therefore what we *won't* re-collect — is
   a differentiator; give it prominence in §4.3.
4. **Add deliberate scope boundaries (§4.7).** Restraint — what we're *not* doing —
   is as much a trust signal in Planning as "Ready to Decide" was in the Overview.
5. **Add the programme's logic/phasing (§4.4).** A sequenced programme with
   dependencies reads as designed; a flat method list reads as configured.
6. **Guard the Planning↔Implementation boundary (§1, §7).** The single biggest risk
   to the "not a tool" feeling. No instrument configuration in Planning.
7. **Tie success to the Overview's readiness (§4.6).** Success = reaching "Ready to
   Decide." This closes the consultancy narrative into one loop.

## 9. Open decisions (for review)

1. **Where does the first draft of the design come from** — auto-derived from the
   Overview's Frontier + Recommendation (my recommendation: yes, for continuity),
   or generated fresh by a planning engine that reads the whole Overered context?
2. **Success criteria granularity** — per need, programme-level, or both
   (recommend both: per-need "what satisfies it" + programme-level "reach Ready to
   Decide").
3. **How much scope/effort to show** — none, a Focused/Full badge, or a light
   effort indication? (Recommend a light scope indication, no PM.)
4. **Phasing representation** — only when Conditional dependencies exist, or always
   as explicit phases? (Recommend: surface phases only when the programme genuinely
   has dependencies; don't manufacture ceremony.)
5. **Editing depth at v1** — reprioritise/reassign/remove needs + challenge method
   assignments (recommend yes), vs read-and-approve only (thinner, less
   consultative).

## 10. Build slices (later — not now)

1. **Proposed Approach + Learning Agenda** — the planning engine deriving needs
   (by aspect) from the Overview context, and the lead proposal statement.
2. **Method Assignment + coverage** — needs → methods with method-fit + rationale,
   and existing-intelligence coverage per need.
3. **Expected contribution + success + scope + Approve** — the contribution
   expectations, success criteria, deliberate boundaries, and the approval →
   versioning → execution hand-off.
