# Fanometrix Research Engine — Architecture Blueprint

> **Status:** Constitution. This document defines the conceptual model Fanometrix
> is built around. It is not implementation and not tied to any current screen.
> Every new capability — surveys, conversation intelligence, documents, News,
> Google Trends, Bluesky, reports, future connectors — is measured against it.
> When code and this document disagree, this document is the intent; the code is
> the debt.

---

## 1. The one idea

**Research is a question answered by evidence. The Research Question is the
fundamental object of the platform, and it is recursive.**

Everything else hangs off a Research Question, identically at every level:

```
Research Question            (recursive — root = the project's question;
        │                     children = "themes"/investigations)
        │  is addressed by
        ▼
     Evidence                 (surveys, conversations, documents, connectors —
        │                     the source type is an attribute of evidence)
        │  is synthesised into
        ▼
     Findings                 (the answer to the question, at any level)
        │  is presented as
        ▼
     Reports                  (a curated view of findings at any question scope)
```

There is **no separate "Theme" entity.** What a researcher calls a Theme —
"Brand Perception", "Sponsor Activation", "Fan Benefits" — is simply a
**Research Question with a parent.** A question is, at once, a statement of
intent, a scope for evidence, a scope for synthesis, and the thing a Finding
answers. Those are not four concepts to reconcile; they are four facets of one.

A 3-source project and a 300-source programme are the **same shape** — a
Research Question tree with evidence — at different sizes. Complexity scales
with the research, never with the platform, because we recurse one object rather
than stack new layers.

---

## 2. The object model

Six objects. No more.

| Object | What it is | Key relationships |
|---|---|---|
| **Research Project** | The engagement envelope: owner, brand/agency, access, dates, status, research mode (real/simulated). It carries no research *intent* of its own. | Owns exactly **one** Research Question tree. |
| **Research Question** | The atomic unit of research intent. **Recursive.** Has a short **display label** and full **question text**. May have child questions and/or evidence. | Belongs to a Project (root) or a parent Question (child). Addressed by Evidence. Answered by Findings. |
| **Evidence Source** | An *evidence producer* — a survey, a conversation search, a document, or any future connector. It is *how* evidence is gathered, never an organising layer. | Gathers Evidence. Bound to a Question (see §4). |
| **Evidence** | The atomic interpretable unit: a survey response, a conversation, a document passage. Typed by its source, treated uniformly. | Produced by a Source. Relevant to one or more Questions. |
| **Findings** | The **answer to a Question**, produced by synthesis. Exist at any node of the tree. | Answer a Question. Synthesised from Evidence and/or child Findings. |
| **Report** | A curated, formatted **presentation of Findings** at a chosen question scope. Selects and dresses; never re-analyses. | Built from the Findings of a Question (and optionally its subtree). |

**Synthesis** is deliberately *not* an object. It is the **operation** that turns
evidence into findings at a given question scope — recursive over the tree.

### Relationships at a glance

```
Project ─1:1─▶ Research Question (root)
Research Question ─1:N─▶ Research Question (children)      [optional, recursive]
Research Question ─1:N─▶ Evidence Source                  [sources bound to a question]
Evidence Source  ─1:N─▶ Evidence
Research Question ─0:1─▶ Findings                          [the current answer; regenerable]
Report           ─N:1─▶ Research Question                 [a report is cut at a question scope]
Evidence         ─N:M─▶ Research Question (by relevance)   [north star — see §4]
```

---

## 3. Label vs. question — one object, two faces

Every Research Question stores:

- **Display label** — short, human, shown throughout the UI ("Brand Perception").
  This is what researchers browse, filter, and title reports with.
- **Question text** — the full research question ("How do fans perceive FedEx's
  brand in football?"). This is what the AI synthesises against and what reports
  quote as the framing.

Internally it is one recursive Research Question object. Externally it reads as a
clean research workspace of short, meaningful labels. If the word "Theme" (or any
other) tests better than "sub-question" in the UI, **only the label vocabulary
changes — never the model.**

---

## 4. How Evidence relates to a Question (the decision that matters most)

This is where "interpretive layer, not storage layer" is won or lost.

- **Assignment (the pragmatic default).** A researcher designs a survey, or scopes
  a conversation search, to answer a specific question. So a Source is *bound* to
  a Question by default, and its Evidence inherits that scope. This is a sensible
  UX and a good starting point.
- **Relevance (the north star, and the *definition*).** Evidence is never truly
  "filed" anywhere. Its **relevance to each question is measured**, and a
  question's synthesis draws on **all evidence relevant to it** — regardless of
  which source produced it or what it was nominally "for." A broad conversation
  search naturally informs several sub-questions; a document passage may answer a
  question no one assigned it to.

**Rule:** the model is *defined* as relevance-bound; it is *implemented*
assignment-first. Assignment is a default and a convenience, never the
definition. This keeps the folder-vs-relevance question permanently settled:
evidence flows to the questions it answers, by measured relevance.

---

## 5. Synthesis & Findings — the roll-up

Findings are produced by synthesis, recursively, over the Question tree:

- **Leaf question** (evidence, no children): synthesise its relevant evidence →
  its Findings.
- **Parent question** (children, and possibly direct evidence): synthesise its
  **child Findings** plus any directly-relevant evidence → its Findings.
- **Root question**: the same operation at the top → the project's Key Findings.

Consequences that must hold:

1. **Findings exist at every level**, and are the *same object* at every level.
   "Per-source summary", "theme findings", and "project Key Findings" are one
   concept at three scopes — not three features.
2. **Findings are scope-addressable and regenerable.** A finding is the *current*
   answer to a question; re-running synthesis produces a new version. History is
   preserved (answers change as evidence accumulates — this is longitudinal
   value, not overwrite).
3. **Synthesis is evidence-type-blind.** It reasons over *evidence relevant to a
   question*, never over "the surveys" then "the conversations" then "the
   documents." Mixed-source synthesis is the default, not a special case.

---

## 6. Reports

A Report is a **presentation of Findings at a question scope** — nothing more.

- Cut at the **root** → the whole-project report.
- Cut at a **child question** → that investigation's report (e.g. "the Brand
  Perception findings"), synthesised from surveys + conversations + documents
  together. This mid-granularity is the most common real client deliverable, and
  it exists for free because a report is just findings at a scope.
- A report **never re-analyses.** If the numbers change, synthesis re-runs and
  produces new findings; the report re-presents them. Selection and formatting
  live in the report; interpretation lives in findings.

---

## 7. The invariants (the measuring stick)

Every future feature is checked against these. A feature that violates one is
wrong, however useful it looks.

1. **The Research Question is the only organising primitive.** No feature
   introduces a parallel container (theme, folder, workstream, campaign group as
   an *analytical* unit). If something wants to "group" research, it is a
   Research Question.
2. **Source type is an attribute of evidence, never a top-level axis.** Nothing in
   Findings or Reports branches on "is this a survey / conversation / document."
3. **Evidence feeds questions by relevance.** Storage location and nominal
   assignment are conveniences; relevance is the binding.
4. **Findings answer questions and are scope-addressable.** No finding is
   hard-wired to "the project" or "a survey" as its only possible scope.
5. **Reports present, they do not analyse.** Interpretation happens once, in
   synthesis.
6. **Optional depth, uniform shape.** Themes/sub-questions are optional; a project
   with no children is a valid, complete tree. The 3-source and 300-source cases
   run the same machinery.
7. **Connectors are interchangeable evidence producers.** Adding News, Google
   Trends, Bluesky, or any future source adds an evidence producer — never a new
   analytical pipeline, vocabulary, or screen.

---

## 8. Anti-patterns this model forbids

- **Themes-as-folders.** A grouping layer with no findings and no report is a tag,
  not a Research Question. Don't build it as a first-class object.
- **Three tools in a shell.** Survey / Conversation / Document as parallel
  top-level pipelines that merely share navigation. The question is the spine;
  the tools are evidence producers behind it.
- **Markets (or any derivable attribute) as a stored grouping.** Market, source
  type, date, and sentiment are *facets computed from evidence* — expose them as
  **views/filters**, never as Research Questions or folders. Reserve stored
  structure for the non-derivable: the researcher's questions.
- **Per-type analysis or report plumbing.** Any `if survey … else if conversation
  …` in synthesis or reporting is architectural debt against invariant #2.

---

## 9. How each evidence type maps in

The model is proven by how cleanly today's and tomorrow's sources fit — with no
special cases:

| Source | Evidence unit | Binds to a question as… |
|---|---|---|
| Survey | a response | the survey answers a (sub-)question |
| Conversation search | a conversation (comment/post/article…) | conversations relevant to the question |
| Research document | a passage / the document | the document informs the question |
| News (RSS) | an article | articles relevant to the question |
| Google Trends | a trend series | signal relevant to the question |
| Bluesky / forums / future | a post / thread | evidence relevant to the question |

Every row ends the same way: **evidence relevant to a question.** That sameness is
the whole point.

---

## 10. Scale behaviour

- **Three sources:** one root question, three sources bound to it, no children.
  Synthesise → Findings → Report. The word "Theme" never appears; there is just a
  question with evidence. Nothing to learn.
- **Enterprise programme:** the root question decomposes into a dozen sub-questions
  (one or two levels exposed in the UI; the model permits more); each gathers
  mixed-type evidence; synthesis rolls up; findings exist at every node; a report
  can be cut at any node. Navigation is by *question*, not by tool.

The platform stays simple because scale is expressed as **more nodes in one tree**,
not more kinds of thing.

---

## 11. Glossary

- **Research Project** — the engagement container; owns one question tree.
- **Research Question** — the recursive primitive; label + full text.
- **Theme / Investigation / Sub-question** — UI vocabulary for a *child* Research
  Question. Not a distinct object.
- **Evidence Source (Connector)** — an evidence producer (survey, conversation
  search, document, News, Trends, …).
- **Evidence** — the atomic interpretable unit; type is an attribute.
- **Synthesis** — the operation that turns evidence into findings at a scope.
- **Findings** — the answer to a question, at any scope; versioned.
- **Report** — a curated presentation of findings at a question scope.

---

*The test for any proposal: “Does this add a node to the Research Question tree,
a new evidence producer, or a new way to present findings? If it adds anything
else, it’s probably wrong.”*
