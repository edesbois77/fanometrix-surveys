# Fanometrix — Analysis Workspace Blueprint (Research Intelligence)

> **Status:** **Agreed / canonical.** Decisions locked (§11) and the
> implementation sequence locked (§10). Implementation proceeds in that order,
> starting with the Evidence Validation gate. **Builds on the existing Intelligence
> Findings engine — it does not redesign Analysis from first principles, and does
> not rebuild `analyseAspectSynthesis`, `AspectSynthesisReader`, the existing
> evidence cards, or the current finding-to-evidence links.** The engine already
> generates evidence-backed findings,
> groups evidence into Research Aspects, writes "Why this matters", classifies
> relevance/confidence, links every finding to its evidence, and renders the
> supporting-evidence cards. This blueprint **elevates and reorganises** that
> pipeline into one merged research narrative per aspect, and fills the few real
> gaps. Stays inside the Research Engine constitution
> (`docs/research-engine-architecture.md`) and composes with the Evidence
> Validation gate (`docs/evidence-validation-blueprint.md`).

---

## 1. The reframing

Analysis today shows findings **per source** — surveys, conversations and
documents each in their own reader. It should become the place where those
findings are **merged into one research narrative**, organised around the
*questions* the evidence answers (Research Aspects), not the *sources* it came
from. The live Analysis route already renders the aspect-grouped synthesis
(`app/research-projects/[id]/(workspace)/analysis/page.tsx` →
`AspectSynthesisReader`); this redesign completes and deepens it.

Two rules sit above everything:

### Core principle — Analysis is not a second AI pass

Analysis is the **presentation and organisation layer sitting above validated
findings.** The interpretive work is already done by the Intelligence Findings
engine (§2). Analysis **reuses** its output — it does not re-interpret evidence
from scratch. Contradictions and gaps are **derived** from findings and evidence
the engine already produced (compute disagreement, detect missing source types),
never a fresh parallel interpretation. Where an LLM phrases a derived contradiction
or gap, it is constrained to *describe what was detected*, citing both sides'
evidence — never to infer a new answer.

### The grounding principle — Analysis never invents

- **Every statement is traceable.** Every summary, key finding, contradiction,
  gap and recommendation must rest on **approved evidence**. A claim the evidence
  doesn't support does not appear.
- **Every finding exposes its evidence.** Each carries the specific evidence refs
  that generated it, expandable to the actual conversations, survey responses and
  document passages. A finding with nothing behind it is not a finding.
- **Weakness is stated, not smoothed over.** Where evidence is weak, conflicting
  or absent, Analysis says so explicitly — Low confidence, a surfaced
  contradiction, or a named gap — rather than inferring certainty. "We don't yet
  know" is a first-class output that **guides future research**, not a hole to
  fill with inference.

One further rule: **Analysis is the single interpretive layer.** The Executive
Report, Full Report, Editorial Article and Presentation all *read* it; they never
re-analyse. Interpretation happens once, in the engine, and is presented here.

---

## 2. Built on the Intelligence Findings engine (reuse map)

Everything below already exists and is **reused as the foundation**. Nothing here
is rebuilt.

| Capability | Where it lives today | Reused as |
|---|---|---|
| Aspect-grouped findings `{summary, key_findings[], recommended_actions[]}` | `lib/intelligence/analysts/analyseAspectSynthesis.ts` (`AspectSection`, `AspectKeyFinding`) | the spine of each aspect section |
| Source-agnostic evidence refs `{type, id}` | `analyseAspectSynthesis.ts` (`EvidenceRef`) | how every finding links to evidence |
| Research Aspect assignment (per evidence item) | `lib/ai-classify.ts` + `lib/social-taxonomy.ts` → `social_mentions.research_aspect` | the grouping axis |
| "Why this matters" | classifier → `social_mentions.relevance_rationale`; rendered by the card | shown on each supporting-evidence card |
| Relevance + confidence | classifier → `relevance`, `relevance_confidence` | the finding's confidence input + card badge |
| Findings → evidence UI (expand a finding to its evidence) | `app/components/research-projects/analysis/AspectSynthesisReader.tsx` (`AspectBlock`) | **the Key Findings UI, reused as-is** |
| Supporting-evidence card (quote, relevance band, confidence, why-this-matters, aspect/topic/entity badges, provenance) | `ConversationEvidenceCard.tsx` | **the evidence card, reused as-is** |
| Flat cross-source Key Findings (raw stats) | `analyseKeyFindings.ts` + `KeyFindingsReader.tsx` | the Project roll-up input |
| Generic persistence + review workflow | `research_summaries` table + `lib/intelligence/store.ts` (`saveDraft/approve/publish`) | storage for the synthesis, extended by one CHECK-widening migration |
| Read-only approved/published overview | `app/api/.../findings-preview/route.ts` | the Project Key Findings roll-up feed |

**The engine is the interpreter. This blueprint is its workspace.**

---

## 3. The redesign — merge, don't silo

Instead of a Survey reader, a Conversation reader and a Document reader shown
separately, Analysis presents **one narrative per Research Aspect**, with all
sources merged into it:

```
ANALYSIS  ·  Research Intelligence
│
├─ PROJECT KEY FINDINGS   (roll-up, top — reuses findings-preview + KeyFindingsReader)
│    The answer to the research question across all aspects.
│
├─ ASPECT — Brand Perception
│    ├─ Summary            reuse AspectSection.summary
│    ├─ Key Findings       reuse AspectBlock cards + ConversationEvidenceCard
│    │                     each exposes: Why this matters · Supporting evidence ·
│    │                     Evidence links · Confidence · Source diversity
│    ├─ ⚠ Contradictions   where sources disagree (surveys +, conversations −)
│    ├─ Research Gaps       what evidence is missing / low-confidence
│    ├─ Recommendations     only from approved findings
│    └─ ✎ Researcher Notes  human interpretation, separate from AI synthesis
│
├─ ASPECT — Fan Benefits    …
└─ ASPECT — Brand Fit       …
```

The per-source readers (`SurveyFindingsReader`, `ConversationFindingsReader`,
`DocumentFindingsReader`) survive as **drill-downs**, not the primary view.

---

## 4. The elements — each mapped to what it reuses

### Project Key Findings (roll-up)
The cross-aspect answer to the root Research Question, at the top because it **is
the basis of the Executive Report**. Reuses the existing `findings-preview`
(approved/published only) + `KeyFindingsReader`. Each rolled-up finding links down
to the aspect(s) it comes from.

### Aspect Summary
Reuse `AspectSection.summary` exactly as produced. Descriptive, grounded, 2–4
sentences.

### Key Findings (multiple per aspect) — **reuse the existing cards**
Reuse `AspectBlock`'s numbered findings and `ConversationEvidenceCard`. Each
finding **must continue to expose**, all from data that already exists:
- **Why this matters** — `relevance_rationale`, already on the card.
- **Supporting evidence** — the expandable evidence cards, already there.
- **Evidence links** — `AspectKeyFinding.evidence: EvidenceRef[]`, already there.
- **Confidence** — **High / Medium / Low, always with an evidence-based
  rationale.** *Lifted onto the finding* from the evidence's `relevance_confidence`
  and **rolled up — never a simple average** (see §11.4). Reuses classifier output;
  no new AI.
- **Source diversity** — *computed* from the finding's `EvidenceRef` types
  (survey · conversation · document). A finding triangulated across sources is
  visibly stronger than a single-source one.

### ⚠ Contradictions — surface disagreement, don't average it
Where sources **disagree on the same aspect** — surveys skew positive while
conversations skew negative; a document claims X while fans report Y. **These are
valuable findings, not noise** — shown with both sides and each side's evidence,
never averaged into a false consensus. **Derived, not a new interpretation:** the
detection reuses the same cross-source "difference / unresolved" logic that
already exists in the report layer (`analyseExecutiveReport.ts` differences +
`resolved`, `analyseFullResearchReport.ts` same-construct contradiction
governance) — **elevated** onto the aspect synthesis instead of living only in the
reports. Where an LLM phrases the tension, it describes the detected disagreement
and cites both sides; it does not resolve it.

### Research Gaps — what to collect next, never inferred
Where evidence is **missing or weak** for an aspect — surfaced explicitly to
**guide future research, not to infer an answer**:
- **No survey evidence** for this aspect → "Run a survey to measure it directly."
- **No conversation evidence** → "Collect conversations to hear how fans talk."
- **No document evidence** → "Add desk research / a Research Library document."
- **Low confidence** across the aspect's evidence → "Gather more before relying on
  this."
Gaps are **computed** from what each aspect's evidence covers (which source types
are present, how confident) — reusing the `evidence_gaps` concept that already
exists on the Executive/Full reports, elevated to the aspect. Closing the loop back
to **Research**.

### Recommendations — only from approved findings
Reuse `AspectRecommendedAction {action, rationale, based_on_findings[]}`. The one
tightening: **a recommendation may only cite approved findings, and none may exist
without supporting evidence.** `based_on_findings` becomes a hard constraint, not a
courtesy — a recommendation with no approved finding behind it is dropped. This is
the grounding principle applied to the action layer.

### ✎ Researcher Notes — the one genuinely new store
A researcher can add their **own interpretation** at project, aspect, or finding
scope — **alongside** the AI synthesis, **never overwriting it**. This is the only
element that does not exist today (the codebase has AI rationale and
`edited_content` overwrite, but no human annotation layer). **AI regeneration must
never overwrite researcher notes** — they persist across every re-synthesis,
re-anchored to their aspect (a finding-level note whose finding changes is kept and
flagged, never dropped).

---

## 5. Two layers, one page — reproducibility

| Layer | Source | Mutable by researcher? | On regenerate |
|---|---|---|---|
| **AI synthesis** (summaries, findings, confidence, contradictions, gaps, recs) | the Intelligence Findings engine, over approved evidence | no (regenerate, don't edit) | replaced (new version) |
| **Researcher notes** | the human | yes | **preserved** |

Keeping these apart lets Analysis be both *reproducible* (every finding traces to
evidence and regenerates identically) and *interpretable* (the researcher's reading
persists independently).

---

## 6. Analysis powers every downstream output

```
Approved Evidence ─▶ INTELLIGENCE FINDINGS ENGINE ─▶ ANALYSIS (presentation/organisation)
                                                          │  the canonical layer reports read
        ┌──────────────┬─────────────────────────────────┼─────────────┬───────────────┐
   Executive Report  Full Report                   Editorial Article  Presentation   (all READ it)
```

Reports **select and dress** the intelligence — they never re-analyse. Because
interpretation lives in one engine and is organised in one place, every output is
consistent and every claim traces back to a finding, its confidence, and its
evidence.

---

## 7. Data model (extends what exists — no new engine)

The `aspect_synthesis` content in `research_summaries` (via `store.ts`) is
extended; **the shapes and machinery are reused**:

```
AspectSection (extended) {
  aspect, summary,
  key_findings: [ { finding, evidence: EvidenceRef[],       // ← EXISTS
                    confidence: {level, rationale},          // ← lifted from relevance_confidence
                    source_diversity: SourceType[] } ],      // ← computed from evidence refs
  contradictions: [ { tension, sides: [ { claim, source_type, evidence: EvidenceRef[] } ], note } ],  // ← elevated from report layer
  gaps:           [ { missing: SourceType|'confidence', suggested_action, suggested_source } ],        // ← elevated from evidence_gaps
  recommended_actions: [ { action, rationale, based_on_findings[] } ],   // ← EXISTS (now gated on approved findings)
  evidence_count, sentiment, sources,                        // ← EXISTS
}
EvidenceRef = { type: 'conversation'|'survey'|'document', id }   // ← EXISTS, source-agnostic
```

- **Researcher notes** are a *separate* store — `research_notes (id, project_id,
  scope: project|aspect|finding, scope_ref, body, author, created_at, updated_at)`
  — so regeneration never touches them. (Not `edited_content`, which *replaces* AI
  output; notes must *coexist*.)
- Everything else reuses shipped machinery: `research_summaries` + `store.ts`, the
  `first_seen_at` staleness watermark (`countRelevantEvidenceSince`), the shared
  evidence cards, `AspectSynthesisReader`/`AspectBlock`. Adding fields is one
  CHECK-widening migration in the established pattern (088–117).

---

## 8. What's genuinely new (the real build scope)

Confirmed by the code — everything else is reuse:

1. **Multi-source aspect grouping.** `analyseAspectSynthesis` today wires only
   `gatherConversationEvidence` (survey + document gatherers are stubs), and
   `research_aspect` is a conversation-only column. To merge sources into one
   narrative, **surveys and documents must be aspect-classified too** — reusing the
   same classifier pattern (`ai-classify` / `social-taxonomy`), not a new one. *This
   is the true prerequisite; without it "merged narrative", "source diversity" and
   "cross-source contradictions" are hollow.*
2. **Contradictions + gaps as first-class fields** on the aspect synthesis —
   *elevated* from the Executive/Full-report layer where the logic already lives.
3. **Confidence + source diversity on a finding** — *lifted/computed* from data
   that already exists on the evidence.
4. **Researcher notes** — the one net-new store + UI.
5. **Recommendations gated on approved findings** — tighten `based_on_findings`
   into a hard constraint (needs the Evidence Validation approval state).

---

## 9. Invariants

1. **Analysis never invents.** Every statement traces to approved evidence; every
   finding exposes its evidence; weak/conflicting/absent evidence is stated
   explicitly (Low confidence, contradiction, gap), never inferred into certainty.
2. **Analysis is not a second AI pass** — it presents and organises the existing
   engine's validated findings; contradictions and gaps are *derived*, not
   re-interpreted.
3. **Reuse over rebuild — do not rebuild** `analyseAspectSynthesis`,
   `AspectSynthesisReader`/`AspectBlock`, the existing evidence cards
   (`ConversationEvidenceCard`), or the current finding-to-evidence links.
   `store.ts` and the `EvidenceRef` model are the foundation; new work is only §8.
4. **Aspects, never sources, organise the page** — source type is provenance +
   diversity, never a top-level axis.
5. **Contradictions are surfaced, not averaged away.**
6. **Gaps guide research** — each names what to collect, never an inferred answer.
7. **AI findings are reproducible; researcher notes are a separate persistent
   layer** — regeneration never overwrites notes.
8. **No recommendation without an approved finding behind it.**
9. Analysis reads **only approved, included, relevant** evidence (validation gate).
10. **Analysis is the only interpretive layer** — reports present it, never
    re-analyse.

---

## 10. Locked implementation sequence

Built in this order. Approved-only Analysis depends on the validation gate, so the
gate is first. Each step is independently valuable and preserves the existing
engine — **nothing here rebuilds `analyseAspectSynthesis`, `AspectSynthesisReader`,
the evidence cards, or the finding-to-evidence links.**

1. **Evidence Validation gate** (`docs/evidence-validation-blueprint.md`) — the
   Draft → Collecting → Pending Approval → Approved → Archived lifecycle,
   Included/Excluded conversations, delta review, and the read gate so Analysis and
   Reports see **only approved + included + relevant** evidence. *This is the
   prerequisite: approved-only Analysis cannot exist without it.*
2. **Reuse the existing findings engine; expose confidence + source diversity on
   current Conversation findings** — lift/compute onto each finding from data that
   already exists. Pure reuse; immediately valuable on conversation-only data.
3. **Extend Research Aspect classification + evidence gathering to Surveys and
   Documents** — aspect-classify surveys + documents with the same classifier
   pattern; wire the currently-stubbed gatherers so findings genuinely merge across
   sources.
4. **Add Contradictions, Research Gaps and Researcher Notes** — contradictions/gaps
   elevated from the report layer (need multi-source evidence from step 3);
   researcher notes as the separate, regeneration-safe store.
5. **Reorganise the Analysis UI around the enhanced existing findings** — merge the
   per-source readers into the one aspect-organised narrative, reusing the existing
   cards and readers.

---

## 11. Locked decisions

1. **Confidence scale — High / Medium / Low, always with an evidence-based
   rationale.** Matches the per-evidence `relevance_confidence` label. No bare
   score without a reason.
2. **Contradictions & Research Gaps are primarily Research Aspect-level outputs.**
   Individual findings **may additionally be flagged** when divergent evidence
   directly affects that finding. (Project-level rollups aggregate the aspect-level
   ones.)
3. **Researcher Notes exist at Project, Research Aspect and Finding scope**, and
   **survive regeneration unchanged** — the AI layer never overwrites them; a
   finding-level note whose finding changes is kept and flagged, never dropped.
4. **Confidence is never a simple average.** Aspect-level and project-level
   confidence are rolled up from a weighted judgement over: **finding strength,
   evidence volume, relevance, source diversity, contradictions, and gaps.** A
   contradiction or a gap *lowers* confidence; corroboration across diverse sources
   *raises* it. The rollup carries the evidence-based rationale required by §11.1.

---

*Analysis stops being three separate readers and becomes one place where the
existing Intelligence Findings engine's output is merged into a single research
narrative — organised by question, graded by confidence, honest about disagreement
and gaps, annotated by a human, and trusted enough to power every report. It reuses
the engine; it does not replace it. It presents validated findings; it never
invents.*
