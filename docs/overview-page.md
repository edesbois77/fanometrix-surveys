# Overview — the Commissioning Stage

**Status:** Canonical page specification. Built against `docs/research-project-domain.md`.
The Overview page is the commissioning stage of every Research Project: it exists
to make the user feel *"Fanometrix understands my business problem"* before any
research is planned. It must not, at this stage, put surveys, conversation
searches or documents in the user's head — those belong to the Research Design.

**Related canon:** `docs/research-project-domain.md` (domain model),
`docs/research-methodology.md`, `docs/conversation-advisor.md`.

---

## 1. Principle

Overview does not present five configuration sections. It produces **one living
artefact — "Our Understanding"** — a Situation Assessment that assembles itself
and gets sharper as Fanometrix works. Every element on the page helps the user
answer a business question; nothing configures software.

Overview is no longer just the first page of a project — it is the **first
impression of Fanometrix**. The bar is: a user who uploads a brief and leaves
thinking *"that understood my business better than I expected"* has already
extended the rest of the platform a great deal of credibility. "Our
Understanding" must therefore read like a genuine **consultancy deliverable** —
a considered document — not a web form with sections.

The narrative arc:

> **Intake → Reflect → Recall → Frontier → Commission**
> "Tell me the problem" → "Here's how I read it" → "Here's what I already know"
> → "Here's what we don't yet know" → "Shall we design the research?"

The page ends on one forward action — **Plan the research** — the hand-off into
the Research Design.

## 2. Page anatomy

### A. Project Identity Header (persistent context — not configuration)

The engagement's letterhead, pinned at the top so the user always knows which
Research Project they're in. Client / brand, project name, engagement status
(here: **Commissioning**), markets, lead. Auto-populated from the brief where
possible; editable via a quiet affordance, never presented as a form. Context,
not a task.

### B. "Our Understanding" — the artefact body

Read top-to-bottom as one assessment, in five beats.

**1 · Intake** *(present only until understanding forms, then recedes)*
- Two equally consultative paths:
  - **Upload a client brief** (PDF / Word / PowerPoint), or
  - **Describe the challenge** — a one-sentence problem statement, after which the
    advisor asks 2–3 sharpening questions (a guided intake, never a blank form).
- While analysing, stream "consultant thinking" states ("Reading your brief…",
  "Searching what we already know…") — the sense of a consultant working.
- Once processed, Intake collapses to a small provenance chip
  ("Based on: Acme_UCL_Brief.pdf + your answers"). The brief is *engagement
  input*, not a Research Library document; it recedes into provenance.

**2 · Reflect — "Our reading of the challenge"**
- **Narrative reflection first** — a short paragraph that reflects the problem
  back *sharper than it was given*, naming the real question and any tension.
  This is where seniority is won; it is not an extraction dump.
- **Structured fields beneath**, each editable inline and each carrying
  **stated-vs-inferred provenance**: Business Challenge · Objectives · Research
  Question (proposed) · Target Audience · Markets · Deliverables · Constraints ·
  Stakeholders.
- **Tensions & assumptions** surfaced as small flagged callouts that invite a
  decision ("The brief assumes awareness is the goal; awareness and relevance are
  different objectives — which are we solving?").
- Editing an upstream field (challenge / research question) offers to **refresh**
  the beats below; refresh is explicit, never auto-thrash.

**3 · Recall — "What we already know"**
- A **grounded synthesis against the research question**, prose-led — a
  consultant's opening memo, not a search-results list. Sources appear as
  **citations beneath** the understanding, never as the headline.
- **Tiered so it is never zero:**
  - **House Intelligence** — category benchmarks, football intelligence: always
    present, gives day-one credibility.
  - **Organisation Intelligence** — this client's past projects, library,
    reports: grows over engagements.
- **Visual treatment:** Recall (and §4 Confidence) should use a more visual,
  at-a-glance treatment — a knowledge map / tiered cards / confidence meters —
  not paragraphs alone. This is a deliverable, and it should look like one.
  - First engagement copy: *"This is your first project with us, so we're drawing
    on our category and football intelligence. As you run research, this becomes
    richer."* Emptiness is framed as "first engagement", never "we know nothing".
- **Every claim is grounded** — cited to a real source, low confidence flagged.
  No ungrounded understanding (the domain model's *measured, not authored* rule
  applied at commissioning).
- **Pluggable provider pattern:** Recall is fed by *intelligence providers* (past
  projects, library, football intelligence, benchmarks, and later survey
  findings, reports, knowledge objects…). Adding a provider must not change the
  page. v1 ships with whatever is real; the rest slot in without redesign.

**4 · Confidence in Current Understanding** *(the headline of the knowledge position)*
- A short, honest summary of **how well we understand the problem given the
  available evidence** — *not* confidence in the eventual research findings.
- One-line overall read ("Solid understanding in most areas; two significant
  unknowns"), plus a compact **per-dimension** breakdown (e.g. audience — high;
  category dynamics — moderate; willingness to pay — low), each with a one-line
  basis drawn from what Recall could and couldn't cover.
- This beat explains **why further research is or isn't required**: low-confidence
  dimensions are exactly where the frontier lies. It is the summary; §5 is the
  detail.
- **This is a pre-research, measured confidence** (from existing intelligence),
  distinct from the Research Design's later confidence-per-need (measured from
  collected research evidence). Same discipline, different subject and stage.

**5 · Frontier — "What we need to learn next"** *(Knowledge Gaps — user-facing label softened; the domain concept remains Knowledge Gaps)*
- The itemised frontier, paired with §4 as one **knowledge position** (summary →
  detail). A gap is precisely a question existing intelligence could not answer.
- Each gap is a **method-neutral open question** ("We don't yet know how many fans
  would pay for a premium experience") — **never** "we'll run a survey". Methods
  are assigned later, in the Research Design.
- Each gap is the **seed of an Information Need**: this is the raw material the
  Research Design formalises. The bridge is emotional and architectural.

**5b · Fanometrix's Recommendation — the professional judgment**
- The closing beat, framed as **"Fanometrix's Recommendation"** — the platform's
  professional judgment on the record, based on the evidence available so far.
- It is about the CLIENT'S DECISION, not the platform's activity: **"Are we ready
  to make a business recommendation?"** — with research as one possible
  consequence, never the subject. This is what keeps the page centred on the
  business problem rather than the product.
- It is a **synthesis** of Understanding + Existing Intelligence + Confidence +
  Frontier — it introduces NO new claims; its rationale cites those beats
  ("confident on X and Y from prior work; the gap is Z"). Method-neutral: even
  "Full Research" never names a method (methods are chosen in the Research Design).
- **Four outcomes** (internal states → these client-facing labels), a readiness
  spectrum — three point forward, one points back:

  | Outcome | Meaning | Hand-off (the adaptive CTA below) |
  |---|---|---|
  | **Ready to Decide** | Existing evidence already supports a confident business recommendation | *Proceed to recommendations* (Conclusions), NOT research |
  | **Focused Research** | Mostly there; specific gaps remain | **Design the Research**, scoped to the gaps |
  | **Full Research** | Significant unknowns first | **Design the Research**, full programme |
  | **Refine Understanding** | The problem itself isn't sharp enough to judge | *Refine the understanding* — loops back to Reflect |

- **Guardrail — be conservative about "Ready to Decide."** It is the boldest claim
  on the page (telling a client they may not need research); reach it only when
  existing intelligence genuinely and sufficiently answers the question with
  strong evidence across the key facets. Default toward Focused Research when
  unsure. Over-declaring readiness would break trust faster than a bad finding.

**6 · Commission — the shared-understanding gate + the adaptive hand-off**
- **Near Reflect (not here):** a lightweight confirmation that the user agrees
  with the understanding ("This reflects my business challenge"). It endorses the
  *problem framing*; it gates the closing action below.
- **The closing action IS the recommendation.** No fixed "Plan the research"
  button — the CTA is whatever the recommendation warrants: *Proceed to
  recommendations* / **Design the Research** (scoped or full) / *Refine the
  understanding*. The button is the advice. Only "Focused/Full Research" carry the
  proposed research question + gaps forward into the Research Design.
- The Research Design begins only once the understanding is confirmed AND the
  recommendation is acted upon — a shared commitment, never a hand-off the user
  never endorsed.

## 3. Interaction & trust rules

- **Progressive, streaming reveal** — the page builds as understanding forms;
  it should feel like a consultant thinking, not a spinner.
- **Everything grounded and cited; low confidence admitted.** Honestly naming what
  we don't know is what makes the user believe we understand what we do.
- **Edit = correcting a colleague**, not filling a form — inline, low-friction;
  upstream edits offer an explicit downstream refresh.
- **One artefact, one endorsement.** No five save buttons; the page culminates in
  a single "Plan the research".

## 4. Domain-model mapping (faithfulness)

- Overview **writes engagement facts** onto the **Research Project**: client,
  brand, audience, markets, deliverables, constraints, stakeholders (+ the
  Understanding as living engagement context).
- Overview **proposes the problem frame** — the **Research Question** and the
  **Knowledge Gaps** — which flow into the **Research Design**, where they are
  formalised into Information Needs + Method Assignment and *approved*.
  Commissioning proposes; the Design owns.
- **Fanometrix's Recommendation routes to the right next stage**, not always
  research: *Ready to Decide* → the decision surface (Conclusions/Reports);
  *Focused/Full Research* → the Research Design (carrying question + gaps);
  *Refine Understanding* → back to Reflect. The recommendation is centred on the
  client's decision; research is one possible consequence, never the default.
- **Existing Intelligence & Confidence-in-Understanding are *measured*** reads
  across prior evidence — grounded, never authored.
- **Two distinct confidences**, both measured, must never be conflated:
  1. *Confidence in Current Understanding* (Overview) — from existing
     intelligence, pre-research.
  2. *Confidence per Information Need* (Design/Analysis) — from collected
     research evidence, post-research.
- **The Understanding is living engagement context** on the Project (re-analysable
  when the brief changes). The versioned, approvable object is the **Research
  Design** it seeds — the Understanding itself is not heavily versioned.
  *(provisional — to ratify)*

## 5. Build slices

1. **Identity header + Intake + Reflect** — upload/describe → reflected
   Understanding with editable, provenance-tagged fields. Delivers the felt
   consultancy tone immediately.
2. **Recall** — Existing Intelligence with the tiered House / Organisation split
   and the pluggable provider seam; ship with the providers that are real today.
3. **Confidence-in-Understanding + Frontier + Fanometrix's Recommendation +
   Commission** — the knowledge position, then the readiness recommendation (four
   outcomes: Ready to Decide / Focused Research / Full Research / Refine
   Understanding) as a grounded synthesis of the prior beats, and the adaptive
   hand-off (to Conclusions, the Research Design, or back to Reflect). One
   commissioning-synthesis engine produces Confidence + Frontier + Recommendation
   together from the Understanding and the gathered Existing Intelligence.

## 6. Open decisions

1. Artefact name — "Our Understanding" (working default); forward action "Plan the
   research".
2. Which intelligence providers are real for v1 (sizes Recall).
3. Understanding as living context vs versioned (§4) — recommended living context.
4. Downstream refresh on upstream edit — explicit, not automatic (recommended).
