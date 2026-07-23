# Fanometrix Principles

> **Status:** **The highest-level document in the canon.** Everything else in
> `docs/` implements these. Every new feature, evidence source, report, AI
> capability, workflow or commercial decision is measured against them.
>
> These are technology-independent. They must remain true whatever the language,
> the database, the AI model, the evidence sources or the interface. They are
> beliefs, not rules: the rules live downstream and change; these should not.

---

## How to use this document

Before building anything, ask: **does this comply with the Fanometrix
Principles?**

If it does not, the design is challenged before implementation, not after. There
are only two legitimate outcomes: change the design, or amend this document
deliberately and in the open. A principle quietly worked around is a principle
that no longer exists.

The question this document answers:

> **What must remain true for Fanometrix to still be worth trusting ten years
> from now?**

---

# I. What we owe the truth

### 1. We never claim to know what we cannot evidence

Fanometrix would rather return five genuine answers than ten plausible ones. A
claim we cannot evidence is not a smaller claim, it is a different product: it is
opinion wearing the costume of research, and one instance of it discredits
everything around it.

- **Encourages** omission over placeholder, and saying plainly where the research
  stops.
- **Prevents** fabricated confidence, invented statistics, and inference dressed
  as observation.

### 2. Weakness is stated, never smoothed

Where evidence is thin, conflicting or absent, we say so. Contradictions are
shown with both sides intact rather than averaged into a false consensus. "We do
not yet know" is a legitimate output, and often the most useful one, because it
tells the client what to do next.

- **Encourages** honest confidence grades, visible gaps, and disagreement
  presented as a finding in its own right.
- **Prevents** the reflex to resolve tension into a tidy answer, and the quiet
  omission of everything that did not fit.

### 3. Every claim is bounded

Nothing we assert is universal. Every claim carries the audience, market, period
and conditions under which it holds. An unbounded claim reads as a general truth,
and a general truth we cannot support is a liability that grows with every year
we keep it.

- **Encourages** precise, narrow, defensible statements.
- **Prevents** a local finding becoming a false universal the moment it is reused
  in another engagement, market or season.

### 4. Every claim is challengeable

Anyone, client or colleague or machine, must be able to ask *why do you believe
that* and receive the evidence, the reasoning and the conditions. A claim that
cannot be interrogated cannot be trusted, however well written.

- **Encourages** claims stated so they could be shown to be wrong.
- **Prevents** unfalsifiable assertions, and confidence that rests on tone rather
  than grounds.

---

# II. How intelligence is made

### 5. Fanometrix has one interpretive layer

Evidence is interpreted exactly once, in one place. Everything downstream
selects, arranges, presents or applies what that layer produced. This is the
single most load-bearing principle in the platform: the moment a second component
starts interpreting, the same evidence produces two different truths and neither
can be defended.

- **Encourages** every surface reading the same intelligence.
- **Prevents** reports, dashboards, exports, client portals and agents each
  quietly forming their own conclusions.

### 6. The Finding is the unit of intelligence

Intelligence is carried by structured, addressable, versioned Findings, never by
prose. Text is rendered from a Finding; a Finding is never recovered from text.
Everything the platform knows is a Finding, and everything downstream consumes
Findings and nothing else.

- **Encourages** intelligence that can be reviewed, related, cited, superseded
  and reused.
- **Prevents** knowledge trapped in paragraphs, where it cannot be approved,
  challenged or carried forward.

### 7. Research reasons from the decision it serves

Every engagement exists because someone must make a decision. Research that does
not reason from that decision produces accurate answers to questions nobody
asked. The commission is the lens for what is worth knowing, never for what is
true.

- **Encourages** findings that move a client closer to a choice.
- **Prevents** competent summaries of whatever evidence happened to be available.

### 8. Every evidence source declares what it cannot establish

Sources produce different kinds of knowledge. What people say when asked is not
what they do. What a publication printed is not what an audience felt. What a
brand says about itself is a claim, not an outcome. Each source declares its
limits, and those limits are the platform's extension point: a new source is a
new declaration, not a new way of reasoning.

- **Encourages** adding sources cheaply and safely, each judged on its own terms.
- **Prevents** every source being treated as though it can answer everything, and
  the reasoning layer being rewritten each time one is added.

### 9. Evidence suitability is enforced, not advisory

Whether a piece of evidence may support a claim is a gate, not a
recommendation. Evidence that cannot legitimately support the kind of claim being
made is excluded, with a stated reason, however relevant it appears.

- **Encourages** claims built only from evidence that can genuinely carry them.
- **Prevents** on-point evidence being wasted, and off-contract evidence
  establishing things it never could.

### 10. Confidence is derived, never declared

How sure we are is calculated from the evidence, by a process independent of the
one that formed the claim. A human may override it, visibly and with a reason,
and the derived value is kept beside the override. Nothing that writes a claim is
permitted to grade it.

- **Encourages** confidence that means the same thing across every analyst,
  project and year.
- **Prevents** certainty that tracks the fluency of the writing rather than the
  weight of the evidence.

### 11. Prior belief is a hypothesis, never a conclusion

Client research, commissioner assumptions and our own accumulated knowledge all
enter as positions to be tested, never as evidence and never as truth. A prior
that fails its test produces a finding, not silence.

- **Encourages** taking client material seriously enough to examine it.
- **Prevents** assumptions entering the evidence pool and confirming themselves,
  and prevents the platform telling clients what they already believe.

---

# III. How intelligence is held

### 12. Advice is traceable to knowledge

Every recommendation names the approved Findings it rests on and can be no more
confident than the weakest of them. When a supporting Finding is superseded or
retired, the advice built on it is revisited rather than left standing.

- **Encourages** a clean separation between what is true and what to do about it.
- **Prevents** advice that outlives its basis, and recommendations that sound
  authoritative because of who wrote them.

### 13. Knowledge is built only from approved intelligence

Nothing enters the organisation's memory that has not been examined and approved
by a person. Draft, unreviewed and rejected material is retained for the record
but never becomes something we know.

- **Encourages** a knowledge base whose contents were each deliberately admitted.
- **Prevents** the slow accumulation of unexamined machine output as
  institutional truth.

### 14. Knowledge is alive

New evidence challenges what we know rather than silently replacing it.
Challenges are adjudicated, not applied. Claims that survive them grow stronger,
claims that fail are superseded, and claims that were only ever true for a season
are allowed to expire. Knowledge is maintained, not merely stored.

- **Encourages** intelligence that improves with age and use.
- **Prevents** both silent overwrite and the opposite failure, an ever-growing
  store of stale claims nobody dares delete.

### 15. The record stands

Nothing is deleted or rewritten in place. Claims are superseded, with lineage
retained; delivered work remains exactly what was delivered; provenance survives
from the moment evidence is observed to the moment a claim is retired. What is
simulated is never confusable with what is real.

- **Encourages** an auditable trail from any statement back to its origin, years
  later.
- **Prevents** history changing beneath a client, and intelligence whose basis can
  no longer be reconstructed.

---

# IV. How the platform endures

### 16. Every claim has a named owner

A person approves every claim the organisation makes, in a capacity, on a date.
Machines propose; people are accountable. This does not change as the machines
improve.

- **Encourages** review as a genuine act of professional judgement.
- **Prevents** intelligence nobody is answerable for, which is the only kind that
  can be delivered carelessly.

### 17. Judgement is the product

Fanometrix sells research judgement, assisted by machines, not machine output
reviewed by humans. The analyst must be able to author, reframe, reject on
grounds of materiality, and demand more evidence, not merely accept or decline
what was proposed. The day the analyst can only approve, the product is a
summarisation service.

- **Encourages** tools that make an expert faster and sharper.
- **Prevents** the workflow degrading into a labelling queue, and the expertise
  draining out of the platform.

### 18. The reasoning model is not the interface

The internal model is deliberately rigorous. The surfaces are deliberately plain.
An analyst works in the language of research, a client reads the language of
their business, and neither is asked to learn ours. Sophistication is visible only
when someone asks why.

- **Encourages** progressive disclosure, and a platform that feels simple.
- **Prevents** intellectual rigour leaking into the interface and producing a
  system only its authors can operate.

### 19. Intelligence must remain explainable to whoever asks

A client, an analyst, a regulator or a machine must all be able to obtain the
claim, its grounds, its reasoning, its confidence, its boundaries and its
history. Explanations are reconstructed from the record, not narrated after the
fact.

- **Encourages** every judgement being stored in a form that can be recomputed and
  re-examined.
- **Prevents** intelligence that can only be defended by the person who happened
  to produce it.

### 20. Scale changes the size, never the shape

A three-source project and a three-hundred-source programme are the same model at
different sizes. Growth is absorbed by recursion and by declaration, never by
adding a new layer, a new special case or a parallel path for the difficult
thing.

- **Encourages** solving the general case once.
- **Prevents** the accretion of bolt-ons that eventually make the platform
  impossible to reason about.

---

## What these principles cost

They are not free, and pretending otherwise makes them easy to abandon quietly at
the first deadline.

- Honest research produces **fewer claims** than confident research.
- Enforced suitability makes some evidence **unusable**, however expensive it was
  to collect.
- Bounded claims are **less quotable** than universal ones.
- Human approval is **slower** than machine output.
- Looking for the counter-case costs **real time and money** on every claim.

Each of these is the price of being trusted with a decision. Any proposal that
improves speed, volume or polish by relaxing one of them is not an optimisation.
It is a change to what Fanometrix is, and should be argued as one.

---

## The test

For anything new, in any part of the platform:

1. Does it create knowledge outside the one interpretive layer?
2. Could its output be traced, challenged and explained by someone who was not
   there?
3. Does it state its boundaries, and admit what it does not know?
4. Is a person accountable for what it asserts?
5. Does it still work with forty evidence sources, ten analysts and ten years of
   accumulated knowledge?

Five noes are rare. One is enough to stop and redesign.

---

*Collection defined how Fanometrix comes to know things. The Intelligence Model
defined what it may say about them. This document defines why any of it deserves
to be believed.*
