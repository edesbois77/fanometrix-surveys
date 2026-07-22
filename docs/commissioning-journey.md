# The Commissioning Journey — narrative design

**Status:** Experience narrative for the new-engagement journey, from *New
Engagement* to the populated Overview. The *what and why of every moment*, not the
UI. Companion to `docs/commissioning-experience.md` (the spec). No implementation.

The emotional target, in one line: **not "we understand your brief" but "here's
what we think you're really trying to solve."** If we hired McKinsey, the first
thirty minutes wouldn't be metadata extraction — it would be our problem, reframed.
That feeling is what this journey exists to own.

## Where this sits — the front door to a Research Project (not to Fanometrix)

This journey is not Fanometrix's front door; it is a **Research Project's** front
door. Nothing about the Research Projects list changes — a user clicking *Research
Projects* sees exactly the list they see today. The journey begins only when they
click **New Engagement** (replacing *Create Research Project*), and it lives in a
**pre-project space**: no Research Project exists yet.

Commissioning's whole purpose is to happen *before* the project — understand the
engagement, derive the understanding, ask where confidence is low, agree the
business challenge, infer the Engagement Type, and commission the work. **Only when
that conversation is complete is the Research Project created.** It then opens on the
Overview and continues the established lifecycle:

> New Engagement → *(commissioning)* → **Research Project created** → Overview →
> Planning → Implementation → Analysis → Reports → Conclusions.

So commissioning does not replace the Research Project workflow — **it is the step
that creates it**, and (see "The seamless transition" below) it does so with no
visible seam between the conversation and the workspace it becomes.

---

## Four challenges I'm making to the agreed plan

1. **The project should be *invisible*, not merely the "output."** The user never
   sees "create project" or "project created." They begin an engagement; they agree
   on the problem; they're working. "Project" is backstage vocabulary. (Pushes your
   #4 further.)
2. **Narrate cognition, not extraction.** The "thinking" states should say
   *understanding the challenge / looking for the tension / framing the real
   problem* — never *extracting stakeholders*. What we narrate signals what we
   value; metadata is done silently.
3. **Agreement on the problem comes *before* the structure is revealed.** The user
   confirms the reframe first; only then does Fanometrix show how it has scoped the
   engagement. Correcting a wrong problem is cheap before the scaffold, expensive
   after.
4. **Asking questions is expertise, not incapacity.** Low confidence is not a weak
   moment — the *quality of the questions* is itself the pitch. A junior asks
   everything; a senior asks the one or two that matter.

---

## The moments

### Moment 0 — The invitation
- **Sees:** on the Projects list, one primary action — **New Engagement** (not
  "Create Research Project"; you begin a relationship, not an object).
- **Fanometrix is thinking:** "Someone has a problem to bring me."
- **Doing:** nothing yet.
- **User does:** clicks.
- **Why:** the first word sets the frame. "Engagement," not "project," not "form."
- **Trust:** the vocabulary of a consultancy, not a database.

### Moment 1 — The opening: "What are we trying to solve?"
- **Sees:** Fanometrix *speaks first* — a warm, confident, category-native prompt:
  *"What are we trying to solve? Share the brief, forward the email, or just tell me
  the situation."* The most inviting affordance is **drop a brief** (zero writing);
  paste and free-text sit equal beside it. The describe box carries a specific,
  sports/brand-native placeholder that models a good answer.
- **Fanometrix is thinking:** "Meet them where they are — a PDF, an email, a
  half-formed thought. My job is to make sense of it, not to make them tidy it up."
- **Doing:** nothing until submission.
- **User does:** drops a file, pastes, or types a sentence — the least possible.
- **Why:** this is the blank-page-anxiety moment. **Fanometrix speaking first turns
  a blank box into an answer** — responding is far easier than initiating. Accepting
  messy reality (an email!) signals "we do the work of understanding."
- **Trust:** it asks the strategist's question in the user's language, and it
  already sounds like it lives in sport and brand.

### Moment 2 — The handoff: "Leave it with me."
- **Sees:** a brief acknowledgement the instant they submit — *"Let me read this
  properly."*
- **Fanometrix is thinking:** taking ownership.
- **Doing:** kicking off analysis.
- **User does:** nothing — they exhale.
- **Why:** the psychological transfer. The burden of articulation moves from the
  user to Fanometrix. A consultant says "leave it with me."
- **Trust:** confident acceptance reads as competence.

### Moment 3 — The reading: genuine cognition
- **Sees:** a considered pause, narrated as a mind at work — *Reading your brief…
  understanding the challenge… seeing what's really at stake… looking for the
  tension… framing the problem.* A few seconds — long enough to feel real, short
  enough to respect the user. **Never** "extracting stakeholders / markets" — the
  metadata is derived silently.
- **Fanometrix is thinking:** "What is this *really* about? Where's the tension?
  How confident am I?"
- **Doing:** derives the reframe, the commissioning content, the identity and the
  engagement type — *and assesses its own confidence* (this drives Moment 4's
  branch).
- **User does:** waits, anticipating.
- **Why:** instant output feels cheap; a real consultant takes a beat. The narration
  builds anticipation for *insight* and signals what Fanometrix values.
- **Trust:** it earns the reveal, and it shows it cares about the problem, not the
  paperwork.

### Moment 4 — The reframe: "Here's what we think you're really trying to solve."
*The moment the whole product is built around.*
- **Sees:** **not** a page of fields — a single, focused statement, like the first
  slide of a great pitch. The engagement, **named** ("Adidas — World Cup 2026
  Cultural Relevance"), and a short, sharp reframe that says the thing the client
  didn't quite articulate:
  > *"You don't have an awareness problem — you have more of that than anyone. The
  > real challenge is that authority in football has moved from the stadium to the
  > group chat, and your scale now reads as corporate. If that's right, your World
  > Cup spend is buying reach you already own, not the relevance you need."*
  It carries: a **negation of the obvious framing**, a flicker of **category
  pattern-recognition**, the **commercial stake**, and — where warranted — one
  gentle, honest **provocation** (the thing the client doesn't want to hear).
- **Fanometrix is thinking:** "Show them I understand their business better than the
  brief did — and that I'm on their side while I do it."
- **Doing:** presenting the highest-confidence single insight; holding all structure
  back.
- **User does:** reads. Feels understood. (The reaction we want: *"Yes — and they
  said it better than I did."*)
- **Why:** this is where a consultancy is chosen. Nail it and everything after is
  believed; paraphrase and the whole thing is dead on arrival.
- **Trust:** it demonstrates understanding *sharper than the client's own* — the
  McKinsey first-meeting feeling, owned.

### Moment 5 — Agreement on the problem (before any structure)
- **Sees:** one human check beneath the reframe — *"Have we understood your
  challenge?"* — with room to react: *Yes, that's it* / *Not quite — here's what's
  off.*
- **Fanometrix is thinking:** "The client is the authority on their own problem;
  I've done the thinking, but they confirm the truth."
- **Doing:** if corrected, it *re-frames* — responds conversationally ("Ah — so it's
  really about winning switchers, not keeping loyalists. Let me reframe.") and
  re-derives.
- **User does:** confirms, or corrects in their own words.
- **Why:** agreeing on the problem is the foundation everything rests on. Correcting
  it here is a sentence; correcting it after full derivation is a demolition.
- **Trust:** partnership — it treats the user as the authority while clearly having
  the expertise. Not a form, not a lecture.

### Moment 6 — The scoped engagement (progressive, in service of the problem)
Only now, after the problem is agreed, does Fanometrix show *how it proposes to
approach it* — revealed by weight, each element a consequence of the last:
1. **The Research Question** (proposed) — the single question the engagement will
   answer. Flows straight from the agreed reframe; the bridge from problem to
   approach.
2. **What we'd need to understand** — the objectives / shape of the inquiry (the
   seeds of the Information Needs the Research Design will formalise).
3. **The practical frame** — audience, markets, deliverables (*requested* +
   *Fanometrix-recommended*, clearly distinguished), constraints, stakeholders.
   Compact, secondary, mostly just confirmed.
- Throughout, quiet **identity chips** — brand · engagement type · methodology ·
  success definition — confirmable, never authored.
- **Fanometrix is thinking:** "Here's the shape of the work — but it all serves the
  problem we just agreed."
- **Doing:** presenting the pre-derived structure, refinable inline.
- **User does:** refines where needed; most of it they simply confirm.
- **Why:** it mirrors how you'd actually talk an engagement through — problem → the
  question → what we must learn → the practicalities. Each earns the next.
- **Trust:** the structure feels *derived from the agreed problem*, not imposed as a
  form.

### Moment 7 — Begin the engagement (the project, born invisibly)
- **Sees:** one action — **Begin the engagement.** No "create project," no "project
  created" modal. The page simply continues into the Overview — Recall → Confidence
  → Gaps → Recommendation — already populated.
- **Fanometrix is thinking:** "We agree on the problem; now let's get to work."
- **Doing:** the project is created (identity + understanding persisted in one call)
  — silently, as a byproduct.
- **User does:** begins.
- **Why:** the project is the *result* of agreement, not its starting point — and
  the user shouldn't even feel it happen. The relationship is continuous; the
  Overview is the next sentence, not a new page.
- **Trust:** seamlessness. No jolt, no software moment — one unbroken conversation.

---

## The seamless transition — no visible boundary

The hardest craft problem is the *join*: commissioning happens with no project;
agreement creates one; the user must never feel the switch. The principle that
solves it is **a single fixed point that never moves — the Understanding.**

- **The Understanding is the through-line.** The "Our Understanding" the user agreed
  to (Moments 4–5) is the *same* artefact that heads the Overview. It does not vanish
  and reappear across a boundary — it stays on screen, and the page grows around it.
- **The workspace assembles around the content, not the reverse.** Commissioning is
  a focused, almost ceremonial canvas — just the user and Fanometrix working out the
  problem, no chrome. On agreement, the Research Project workspace *materialises
  around* that fixed Understanding: the lifecycle nav (Overview → Planning → …), the
  project letterhead (already shown as the engagement name during commissioning), the
  surrounding furniture. The content is the anchor; the frame appears around it. There
  is no boundary because nothing the user was looking at moves.
- **Creation is silent.** "Begin the engagement" never says "project created" — no
  modal, no confirmation, no name-your-project step (the name was agreed moments ago).
  The Research Project simply now exists — felt later (it's in the list; it has a
  lifecycle), never announced as a jolt.
- **The narration continues.** Fanometrix's voice carries across the join unbroken:
  agreeing the problem flows straight into *"Good — now here's what we already know,
  and what we'd need to find out"* (Recall → Confidence). The lifecycle continuing
  *is* the consultant continuing to work; the transition is narrated as the next
  natural thing a strategist does, never as a system state change.

Net effect: **one unbroken conversation** that begins as "what are we trying to
solve?" and, without a seam, *becomes* a living Research Project open on its Overview.

---

## The confidence branch (designed behaviour)

Fanometrix never fakes certainty. It self-assesses at Moment 3 and behaves like a
senior consultant would:

- **High confidence** (rich, clear brief): straight to the reframe (Moment 4).
  Decisive. No questions. *Feels like expertise.*
- **Medium confidence** (good brief, one decisive fork): reframes, then embeds **the
  one question that changes the approach** — *"The one thing that decides everything:
  are we keeping existing fans, or winning switchers from Nike?"* Answer it and the
  reframe sharpens. *Asking the single right question is itself seniority.*
- **Low confidence** (thin input — a one-liner, a vague email): does **not** pretend.
  It reflects back the little it did grasp, then asks **2–3 sharp, specific
  questions** — framed as *"To do this properly, I need to understand a couple of
  things"* — and the questions themselves demonstrate expertise (they're the *right*
  ones). Then it reframes. *Low confidence is a different senior interaction, not a
  weaker one.*

The unifying rule: **the quality of the questions is the pitch.** Even knowing less,
Fanometrix demonstrates more.

## One experience, four engagement types (internal vs external)

The journey is **identical in shape** for every type — brief → reframe → agree →
scope → begin. What differs is only the **lens** (the engagement type), inferred and
mostly invisible:
- **External / uncleared users** only ever reach **Research Study** — they never
  learn other types exist. One product.
- **Internally-cleared users**: Fanometrix infers the type (a submission deadline +
  pitch language ⇒ RFP Response; a partnership brief ⇒ Partnership Planning; a
  research request ⇒ Research Study) and shows it as a quiet, confirmable chip. The
  lens shifts the *reframe's angle* (an RFP reads as "how do we win this"), the
  *success definition*, and later the *outputs* — but the journey never changes.
- Inference is **capability-scoped**: it may only propose a type the user is cleared
  to create; internal types are invisible, unproposable and uncreatable without
  clearance (server-enforced). Setting an internal type silently applies the
  internal-by-default posture.

It is one experience because the type is a **lens on the same journey, not a fork**.
Nobody chooses a product; they describe a challenge, and Fanometrix applies the
right lens.

## Why the reframe is the product

Everything before Moment 4 exists to set it up; everything after follows from it.
The bet is simple: **win the relationship in the first thirty seconds by reframing
the problem more sharply than the client stated it.** A great reframe negates the
obvious framing, shows category pattern-recognition, names the commercial stake, and
occasionally tells one honest truth the client didn't want to hear — and it does all
of this *on the client's side*, making them feel smarter, not lectured.

**Dependency, stated plainly:** this only works if the derivation genuinely
reframes. The paraphrase-not-reframe weakness from the Overview critique is fatal
*here first* — so that fix is the foundation this entire journey stands on.
