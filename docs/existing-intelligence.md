# Existing Intelligence — provider architecture

**Status:** Canonical spec for the Overview "Recall" section (docs/overview-page.md §B.3).
Built against `docs/research-project-domain.md`.

## 1. Principle

Fanometrix must **never pretend to know something it cannot genuinely evidence.**
Existing Intelligence surfaces only information that can actually be queried today,
and **every statement is traceable to a real source**. A provider that isn't
implemented is *omitted*, never faked. We would rather show five genuine providers
than ten placeholders.

## 2. Two categories

- **House Intelligence** — Fanometrix's own knowledge (Football Intelligence,
  sponsorship best practice, benchmarks, methodology, platform/research
  principles). Always *eligible*, but only surfaced when a provider genuinely
  returns evidence.
- **Project Intelligence** — the organisation's own evidence, drawn from its
  research work: previous Research Projects, Research Library documents, previous
  approved findings/reports, conversation/survey findings. Org-scoped. Labelled
  "Project Intelligence" (not "Organisation Intelligence") so the category does
  not overload "Organisation Intelligence", which is reserved as a specific
  provider/product that may register under this category later. Internal enum
  value: `project`.

## 3. Honest v1 inventory

- **Project providers with real data today:** Research Library (+ approved
  document analyses), Previous Research Projects, Approved Findings / Reports
  (`research_summaries`). Conversation/Survey findings exist per-project and reach
  Recall via those approved analyses.
- **House providers today: none.** Football Intelligence et al. are not queryable
  stores yet and are deliberately NOT built here. **House Intelligence is
  scaffolding awaiting its first provider.** Day-one house credibility arrives
  when Football Intelligence plugs in; until then, if an org also has no prior
  work, Existing Intelligence is honestly thin — we say so, we do not fabricate.
  (This revises the earlier "never zero via house knowledge" assumption: honesty
  wins over the credibility floor.)

## 4. The provider contract

```
IntelligenceProvider
  id, name
  category: "house" | "project"
  isAvailable(): boolean | Promise<boolean>   // not wired/configured → never called, never shown
  retrieve(ctx): Promise<IntelligenceFinding[]>  // MUST return [] when nothing is genuinely evidenced

IntelligenceFinding
  statement                 // the claim, in plain language
  detail?
  strength                  // evidence strength: "strong" | "moderate" | "limited" — how well-supported
  sources: IntelligenceSource[]   // >= 1 ALWAYS — a finding with no source is inadmissible
  aspect?                   // which aspect of the problem it bears on

IntelligenceSource          // the traceability unit
  provider                  // "Research Library"
  label                     // "Sponsorship Benchmark 2024" / "Research Project: FedEx UCL"
  href?, ref?               // deep-link / structured reference to the real object

IntelligenceContext
  projectId, orgId, researchQuestion, understanding, markets
```

## 5. Invariants (enforced at the seam, not just in prompts)

1. **No unattributed claims.** The orchestrator drops any finding with zero
   sources. The UI can only ever render grounded, cited intelligence.
2. **No fabrication.** `retrieve` returns `[]` when unevidenced; unavailable
   providers are never called.
3. **Omission over placeholder.** A provider that contributes nothing does not
   appear.
4. **The Overview never changes when a provider is added.** New products register
   via `registerIntelligenceProvider`; the page and UI are untouched.

## 6. Orchestrator

`gatherExistingIntelligence(ctx)`: filter to available providers → retrieve with
bounded concurrency → enforce invariants (drop unsourced findings, omit empty
providers) → group by category (house, then organisation). Returns a plain data
shape the Overview renders; no provider-specific knowledge leaks upward.

## 7. Provenance in the UX

Every important claim renders with its attribution beneath it:

> **Fans consistently value tangible benefits over brand visibility.**  · Strong
> Sources: Football Intelligence · Sponsorship Benchmark Library · Research Project #24

Each source links to the real object. Provenance is a required field on the data
model — an unattributed claim cannot reach the screen. Each finding also shows its
**evidence strength** (strong / moderate / limited) so the researcher can see how
well-supported it is, distinct from how relevant it is.

## 8. Deferred (not v1)

- **Cross-provider synthesis** — clustering the same claim from multiple providers
  into one statement with merged sources. When added, it will only merge and
  attribute, never introduce a claim beyond what providers returned.
- **Football Intelligence, Survey Findings, Google Trends, News, Knowledge
  Objects** — each plugs in later as a provider; the Overview does not change.

## 9. Build status

- **Interface + registry + orchestrator:** `lib/intelligence/existing/`
  (`types.ts`, `registry.ts`) — the pure seam, empty registry.
- **Slice 2:** implement the genuine Organisation providers (Research Library,
  Previous Projects, Approved Findings) + the Recall UI with provenance; House
  renders as "awaiting its first provider" until Football Intelligence arrives.
