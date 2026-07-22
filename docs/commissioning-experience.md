# Commissioning a New Engagement

**Status:** Product specification for the new-engagement / project-creation journey.
Design only — no implementation. Built against `docs/overview-page.md`,
`docs/engagement-types.md`, and the RP domain model.

---

## 1. Principle

Creating a project and commissioning an engagement are **the same action**. The
user never creates an empty project and then fills it in. They begin a
conversation; **Fanometrix derives the engagement; the user refines it; the
project is created only once they agree on the problem.**

The deepest framing: **the project is a *byproduct of agreement*, not an object you
author.** You don't "create a project" — you and Fanometrix agree on what you're
solving, and the project is what you get. That is "derive, don't author" taken to
its natural conclusion.

## 2. The journey (end to end)

> **New Engagement → The Ask → The Work → Our Understanding → Agreement → (project created) → the Overview continues**

There is no create form, no research-question field, no metadata to hunt. The whole
journey renders with the Overview's own Intake/Reflect components — so creation
*is* the opening of the Overview, and when the project is created the page simply
keeps going into Recall → Confidence → Gaps → Recommendation. Same conversation,
never a restart.

### Screen 1 — The Ask: "What are we trying to solve?"
One surface, not a form. Three ways in, all equal:
- **Upload a brief** (PDF / Word / PPT)
- **Paste** an email or brief text
- **Describe the challenge** in free text

A single quiet line sets the expectation — *"Fanometrix will read this, understand
the business problem, and propose the engagement."* Nothing else is asked: no name,
no research question, no study type, no orgs.

*(The "describe" path must not be an intimidating blank box. It carries a strong,
specific placeholder and — see §4 — Fanometrix will ask sharp follow-ups if what it
gets is thin, rather than confidently inventing.)*

### Screen 2 — The Work: Fanometrix reads it
A genuine "consultant thinking" moment, its lines tied to real analysis stages:
*Reading your brief… understanding the business challenge… identifying commercial
objectives… mapping stakeholders… looking for tensions… framing the engagement.*
This beat is not decoration — it is what makes the next screen feel *earned* rather
than *generated*.

### Screen 3 — Our Understanding: insight-first, not a wall of fields
This is where the whole thing is won or lost, and where I most want to change the
naïve version (see §3). It arrives **named and framed**, insight first:

> **Adidas — World Cup 2026 Cultural Relevance**
> *"You don't have an awareness problem — you have more of that than anyone. The
> real challenge is that football authority has moved from the stadium to the group
> chat, and your scale now reads as corporate…"*

Beneath the framing, everything is **derived, pre-filled, and refinable** — but
*progressively disclosed by importance*, never dumped as nine equal fields:
Business Challenge · Research Question *(proposed)* · Objectives · Target Audience ·
Markets · Deliverables · Constraints · Stakeholders · Engagement Type · Success
Definition. Each carries stated/inferred provenance. Tensions are surfaced.

### Screen 4 — Agreement: agree on the problem, not ratify a form
One human beat: *"Have we understood your challenge?"* → refine, or **"Yes — this
reflects my challenge."** Only then is the project created (one call persists
identity + understanding together). The user is now in the Overview, already
populated, continuing the same conversation.

## 3. The reveal must be insight-first — the core challenge to the naïve flow

The obvious build — read the brief, hand back all nine derived fields at once — is a
trap. Nine equal-weight fields *is a form that filled itself in*, and it triggers
every failure from the Adidas critique: the QA-panel feel, the sense of "processing"
not "understanding," and reviewer overwhelm. A senior strategist does not open by
handing you a completed nine-box document. So:

- **Lead with the reframe + the named engagement + the single sharpest tension.**
  That is the "do they *get* it?" moment, and it must contain a genuine insight, not
  a paraphrase of the brief.
- **Progressive disclosure by weight:**
  - *Hero* — the named engagement + the reframe (what earns "yes").
  - *The sharp bit* — 1–2 real tensions/insights.
  - *The frame (secondary, refinable)* — research question, objectives, audience,
    markets: how we've scoped it.
  - *The practicalities (tertiary, collapsible)* — deliverables, constraints,
    stakeholders: operational detail, usually just confirmed.
  - *Identity (quiet chips)* — brand · engagement type · methodology · success
    definition: confirmable, not authored.
- **The confirmation is on the *understanding*, not the fields.** The emotional beat
  is agreeing on the problem. The nine derivations are supporting evidence the user
  *can* inspect and correct — never a checklist they must ratify. This is the line
  between "engaging a consultant" and "approving an auto-filled form."

## 4. When Fanometrix asks vs. assumes (the senior move)

A junior tool confidently fills every field even from a thin brief — and produces
the generic slop the critique caught. A senior consultant *asks* when the brief is
ambiguous. So the flow branches on the analysis's own confidence:
- **Confident derivation** → present Our Understanding directly.
- **Thin / ambiguous input** → before (or alongside) the understanding, Fanometrix
  asks **1–3 sharp, specific questions** — *"Is this aimed at existing Adidas fans,
  or winning switchers from Nike? It changes the whole approach."* — then sharpens.

Building genuine uncertainty-handling into the *first* experience is a strong
differentiator: it signals a mind that knows the difference between what it knows
and what it's guessing — and it kills the generic-derivation risk at the source.

## 5. Engagement Type — inferred, capability-scoped, and a lens that re-frames

The user rarely chooses the type from a menu. Fanometrix **infers** it from the
brief (a submission deadline + pitch language ⇒ RFP Response; a partnership brief ⇒
Partnership Planning; a research request ⇒ Research Study) and shows it as a **quiet,
confirmable chip** on the understanding. Two rules make this powerful and safe:

- **Capability-scoped inference.** The inference may only ever *propose a type the
  user is cleared to create.* Internal types (RFP Response, Internal Strategy,
  Partnership Planning) are invisible and unproposable to users without
  `can_access_internal_engagements`; external users only ever experience Research
  Study. Enforced server-side, not just hidden (per `docs/engagement-types.md`).
- **Changing the type re-frames the understanding.** Because the type is a *lens*
  (it sets the success definition, output profile and how the brief is read),
  switching it re-derives the framing — an RFP is read as "how do we win this," a
  study as "answer this question." The **Success Definition** is therefore not
  authored: it is derived from the inferred type (its registry default) refined by
  the brief's specifics (e.g. the RFP submission deadline).

## 6. Internal vs external workflows

- **External users** (and any user without internal clearance): the journey only
  ever yields a **Research Study**. No internal type is shown, proposable, or
  creatable. The experience is identical in shape — brief → understanding → agree —
  just constrained to the one type.
- **Internally-cleared users:** the full inference space, with the internal-by-
  default posture applied the instant an internal type is set (visibility,
  ai_access, learning per `docs/engagement-types.md`). A purpose set to an internal
  type is also a visibility event.

## 7. Persistence — derive first, create on agreement

- **Nothing is written until the user agrees.** Derivation happens pre-creation
  (the analyst needs only the brief text, not a project row). On "Yes," a single
  **commission** call creates the project with identity **and** understanding
  together. No half-formed draft shells accumulate. (Cost: an LLM analysis is spent
  before creation; abandonment wastes spend but leaves no data litter — the right
  trade.)
- **The create API must be relaxed.** `POST /api/research-projects` currently
  *requires* `research_question`. In this model the RQ is *proposed*, never authored
  up front — so creation must accept a project born from a brief with a derived RQ.
  This is the concrete line of old research-tool architecture to remove.

## 8. Identity derivation & the brand↔org link

The analyst derives project **identity** as well as commissioning content: a strong
engagement **name**, the **brand/client** and **agency** (as names), **methodology**
(`study_type`), **markets**, **tags/topic**, and the inferred **engagement type**.

The one genuinely hard bit: the brief says "Adidas" (a name); `brand_org_id` is a
foreign key. So Fanometrix derives the *name*, fuzzy-matches it to an existing
organisation, and presents a **confirmable chip** — *"This looks like an Adidas
engagement — link to the Adidas org?"* No match → offer to create the org or hold
the name and link later. **A refinement, never a gate**: a project can be born with
a derived brand before the org is linked.

## 9. How it flows into the Overview

The commissioning journey *is* the Overview's Intake → Reflect. On agreement, the
Understanding it produced is exactly what the Overview stores, so the page continues
— Recall → Confidence → Gaps → Recommendation — with no reload, no "now here's your
project" jolt. The Overview is the continuation of one conversation, not the place
it begins.

## 10. The quality bar (first impression is highest stakes)

This is the **first thing a client ever sees**, so every critique finding is fatal
*here first*, and the derivation quality bar is higher than anywhere:
- It must **reframe, not paraphrase.** A named framing that merely restates the
  brief loses the room at hello.
- It must be **specific to this brand.** Generic derivation is worse at creation
  than anywhere.
- It must **not feel like a form.** Lead with framed insight; keep the derived
  fields a quiet, refinable, progressively-disclosed panel.

**Dependency:** the reframe-not-paraphrase fix flagged in the Overview critique is a
*prerequisite* for this journey to land — the commissioning analyst must genuinely
reframe.

## 11. My challenges to the proposal (summary)

1. **Don't reveal nine fields flat — reveal insight-first, progressively (§3).** The
   flat dump recreates the form we're killing.
2. **Ask when unsure (§4).** Confidence-aware; clarifying questions on thin briefs.
   The senior move, and the antidote to generic derivation.
3. **Make the confirmation *agreement on the problem*, not ratification of a form
   (§3).** The project is a byproduct of that agreement.
4. **Changing the engagement type re-frames the understanding (§5)** — the type is a
   lens, not a tag.

None of these contradict the proposal; they push it further toward consultancy and
away from software.

## 12. Open decisions

1. **Label** — "New Engagement" (recommended) vs "New Research Project".
2. **Blank-start escape hatch** — keep a quiet "start without a brief" for power
   users, or force brief-first for everyone? (Recommend a de-emphasised escape.)
3. **Org auto-creation** — auto-create the org when the brand is unknown, or hold
   the name until an admin links it?
4. **Clarifying-questions depth** — cap at how many, and are they ever *required*
   before proceeding, or always skippable? (Recommend ≤3, always skippable.)
