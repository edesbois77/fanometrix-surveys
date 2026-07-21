# Conversation Advisor

The entry point for Conversation Intelligence inside a Research Project. It replaces the
old "Research Question + Keywords + Sources" search-builder with a **consultant briefing**:
the researcher commissions research, they do not configure a search engine.

Canonical methodology: `docs/research-methodology.md` (the shared research-design spine).
This document covers the Conversation-method advisor specifically.

## Principle

Conversation Intelligence never begins with keywords. It begins with a **recommendation**.
The information need — not the search query — is the durable unit of research. Keywords are
an implementation detail revealed only on request.

## The briefing flow (what the researcher sees, in order)

1. **Our Recommendation** — the consultant's verdict, in prose. Why Conversation Intelligence
   is (or isn't) the right method, what it can answer, what it cannot, and where a
   complementary method (e.g. Survey) is recommended.
2. **What we'll investigate** — **Research Themes** are primary UX (e.g. Fan Perception,
   Authenticity, Engagement Opportunities, FedEx's Current Position). Each theme expands to
   reveal its underlying **information needs**, which stay internal.
3. **Recommended platforms** — recommended + why, not-recommended + why. Where expertise shows.
4. **Research limitations** — honest boundaries; natural hand-off to Survey where appropriate.
5. **Approve Conversation Research** — a single action. Never "Run Search."
6. **Advanced implementation** (collapsed) — Search Strategy, Preview, Keywords, Operators,
   platform-specific settings. The old form, demoted behind one disclosure.

## Recommendation = internal state → consultancy language

The engine reasons in states; the UI only ever shows consultancy language.

| Internal state (engine)   | User-facing label                    | Meaning |
|---------------------------|--------------------------------------|---------|
| `proceed`                 | **Recommended**                      | Conversations are right for all of it. |
| `proceed_plus_complement` | **Recommended with Survey**          | Right for most; part needs another method too. |
| `reframe_first`           | **We recommend refining the question** | The question holds two distinct objectives; split into studies. |
| `redirect`                | **We recommend a different method**  | Conversations aren't the right primary method here. |

Challenges are actionable, never blocking: every one offers the better path *and* "Proceed
anyway." A consultant advises; the researcher decides (light human-confirmed, not a heavy gate).

## Themes, needs, and aspects are one structure

- **Theme = Research Aspect** — the durable organising unit already shared with Analysis.
  Surfaced at the front of the briefing. One aspect contains one or more information needs.
- **Information Need** — nested inside a theme/aspect, internal. Evidence is *judged against*
  needs; the researcher *navigates* aspects; Analysis *synthesises* aspects. The aspects
  defined here up front are the same aspects Analysis synthesises against — the spine closes
  end to end.

## Persisted on `social_searches`

```
information_needs jsonb:
  themes: [ { aspect, needs: [ { need, method_fit, rationale } ] } ]
recommendation jsonb:
  { state, challenges: [ { type, target_method?, need?, message, action } ] }
```

`method_fit` ∈ `primary | supporting | conditional | not_suitable`.

## Engine

`lib/intelligence/analysts/analyseConversationAdvisor.ts` (promotes the old
`analyseSearchStrategy`) emits: recommendation (state + challenges), themes-with-needs,
per-platform recommend/not-recommend rationale, limitations — and *then* the search
strategy/keywords as its final, subordinate output. Same `completeJSON` plumbing.

## Build phases

1. Advisor Briefing entry (recommendation-first; old form → collapsed "Advanced implementation").
2. `analyseConversationAdvisor` analyst.
3. Persist `information_needs` + `recommendation`; judge evidence against the needs.
4. Wire the project plan's `ConversationIntent` → briefing (no cold starts).
