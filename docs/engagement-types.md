# Engagement Types, Internal Access & Adaptive Outputs

**Status:** Proposed architecture specification, grounded in the existing model —
for review before build. Extends `docs/research-project-domain.md` (does not
replace it). No implementation here.

**Related canon:** `docs/research-project-domain.md`, `docs/overview-page.md`,
`docs/planning-page.md`, `docs/existing-intelligence.md`.

---

## 1. The core principle — Purpose is a lens, not a fork

The Research Project does not exist merely to conduct research. It exists to
produce **the best evidence-backed answer to an engagement**. Sometimes that
answer is a research report; sometimes it is an internal strategic response and a
multi-million-pound pitch deck.

So the RP gains a **Project Purpose**, but the workflow must NOT split into two
products. One shared spine runs for every purpose:

> **Overview (commission) → Planning (Research Design) → Execution (collect) → Analysis (synthesise) → Outputs (deliver)**

The **evidence spine is identical** for both purposes — Understanding → Information
Needs → Evidence → Analysis. Purpose is a lens that adapts only three things:
1. what the Overview **captures** (Engagement Context — richer for RFP),
2. what Analysis and Outputs **emphasise and produce** (report vs pitch deck),
3. a cross-cutting **access / visibility / sensitivity** model (internal-by-default
   for RFP).

Everything below serves "adapt, don't fragment."

## 2. Engagement Type

The concept is broader than RFPs: the internal use case spans client briefs,
internal strategy work, partnership planning and future kinds of engagement.
**Research Study and RFP Response are simply the first two Engagement Types.** So
this is modelled as a first-class, extensible **Engagement Type**, not a two-value
"RFP-or-not" flag.

- `engagement_type` — an orthogonal engagement fact on the Research Project (the
  Project owns engagement facts — domain model §3). **Orthogonal to `study_type`**
  (the 12-value methodology enum) and `research_mode` (`real`/`simulated`,
  immutable): the engagement type is *why the engagement exists*, its own column.
- **Registry-driven (the key to extensibility).** Each type is defined in an
  engagement-type registry that *declares its own properties* — `internal?`,
  `default_visibility`, `capability_required`, and later its commissioning-context
  shape, output templates and analysis emphasis. Adding a type (client_brief,
  internal_strategy, partnership_planning…) is a **registry entry**, with **no
  change to enforcement or workflow**. Enforcement reads `type.internal` +
  `type.capability_required`; it never hard-codes "rfp".
- v1 registry: `research_study` (external-available, org-visible) and
  `rfp_response` (internal, capability-gated, internal-by-default).
- Read by each stage's engine/template as a **lens** (a registry lookup): the
  Understanding, Planning, Analysis and Outputs adapt emphasis and output shape by
  type; the shared engines and data structures do not change. Same pluggable
  pattern as connectors, advisors and intelligence providers.
- Mutable by cleared users (a study can become a pitch), but switching **to** an
  internal type applies that type's internal-by-default posture (§4) — a type
  change is also a visibility event.

**How each stage adapts (same spine, different lens):**

| Stage | Research Study | RFP / Pitch |
|---|---|---|
| Overview | commission understanding of the business question | + rich Engagement Context; the "question" is "how do we win this brief" |
| Planning | the research programme | research still planned, but framed as *evidence to strengthen a wider strategic response* |
| Execution | collect evidence | identical |
| Analysis | findings + recommendations | findings feed strategic interpretation, audience insight, activation principles |
| Outputs | research report / conclusions | pitch deck: strategy, insight, activation, creative territories, media/partner, measurement, evidence appendix |

The divergence concentrates at the **input** (Engagement Context) and **output**
(deliverable) edges; the middle is shared.

### 2.1 Success Definition — the objective function (per type)

Every engagement type declares not only *who can access it* but **what "success"
looks like** — the objective against which Fanometrix evaluates progress and
generates outputs. This is the most fundamental property a type carries, because it
is what every downstream judgment is measured against. Crucially, **it changes the
objective, never the workflow.**

| Engagement Type | Success = |
|---|---|
| **Research Study** | answer the research question with sufficient confidence |
| **RFP Response** | produce the strongest evidence-backed strategic recommendation + pitch materials before the submission deadline |
| **Client Brief** | develop an informed recommendation for the client |
| **Internal Strategy** | support internal decision-making |
| **Partnership Planning** | identify the strongest commercial opportunity |

A Success Definition describes not only *when an engagement is complete* but *what
constitutes a successful output*. So `success_definition` **and an
`output_profile`** join `{ internal, default_visibility, capability }` as registry
properties of each type (see §2.2). The success definition is the **objective
function** that parameterises — without changing — the shared stages:

- **The Overview's readiness recommendation** ("are we ready?") is evaluated against
  *this* success definition. The four-outcome spectrum (Ready to Decide / Focused /
  Full / Refine) generalises to *"are we ready to satisfy the success definition?"*,
  with type-appropriate language (for RFP, e.g. "Ready to Pitch") and the output it
  points to.
- **Planning's "What Success Looks Like"** beat states the type's success
  definition (refined by the engagement), not a hard-coded "answer the research
  question".
- **Analysis + Outputs** are evaluated and generated against it — the deliverable
  that *constitutes* success differs (research report vs pitch deck).

**Instance refinement.** The type provides the *default* success definition; a
specific engagement carries its own parameters — most importantly **constraints**
like the RFP submission **deadline** (from Engagement Context, §3), so readiness for
an RFP factors in "in time", not only "with confidence". Type = the template; the
engagement = the specifics.

**Authored, not fabricated.** The success definition is *authored* (part of the
engagement / Research Design); *progress toward it* is *measured* (the readiness
recommendation, confidence). Same authored-vs-measured discipline as everywhere else.

### 2.2 Output Profile — what a successful output looks like (per type)

Alongside the success definition, each engagement type owns an **output profile**:
defaults that let Fanometrix adapt reports and recommendations naturally, **without
introducing new workflows**. Four properties, all instance-refinable:

| Property | What it sets | Research Study | RFP Response |
|---|---|---|---|
| **Default deliverables** | the outputs this type produces | research report / conclusions | pitch-deck sections (strategy, insight, activation, media/partner, measurement, evidence appendix) |
| **Intended audience** | who the output is for (shapes framing/tone) | research/client stakeholders | the pitch evaluation panel |
| **Evidence threshold** | the rigour bar for "sufficient" | high — answer with confidence | strong-enough-to-be-compelling; directional + clearly-labelled creative acceptable |
| **Presentation style** | how outputs are framed/styled | formal research report | persuasive, narrative pitch deck |

How each flows through the *shared* spine:
- **Evidence threshold parameterises the readiness machinery we already built.** The
  bar at which "Ready to Decide / Ready to Pitch" fires — and the confidence a
  finding must reach to count as "sufficient" — is set here, per type. A Research
  Study demands high confidence; an RFP may proceed on compelling directional
  evidence plus clearly-labelled creative hypotheses (per the evidential-status
  rules, §8). Same readiness engine; a type-specific threshold.
- **Intended audience + presentation style parameterise Outputs/Reports** — the
  framing, tone and structure of the generated report or deck. Same generation
  pipeline; type-specific voice.
- **Default deliverables** seed the Requested-vs-Recommended deliverable set (§5)
  and the output templates.

These are **defaults, not locks**: a specific engagement refines any of them (a
board-level study may raise its evidence threshold; an RFP may name a specific
deliverable set from the brief). Type = the template; engagement = the specifics.
The output profile changes *what a good answer looks like*, never *how the workflow
runs*.

## 3. Engagement Context (distinct from Organisation Intelligence)

Two different things that must not be conflated:

- **Engagement Context** — what is specific to *this* RFP/project. Structured
  engagement facts on the Project (`engagement_context` jsonb, or a column group):
  brand, agency, key contact, additional stakeholders, internal owner, RFP
  deadline, presentation date, budget/range, markets, target audiences,
  rights/assets, existing campaign platform, requested deliverables, constraints,
  briefing notes, follow-up notes, commercial context, confidentiality.
- **Organisation Intelligence** — what Fanometrix *already knows* about the brand,
  agency, contacts and historical relationship. Reusable, cross-engagement,
  surfaced via the Existing Intelligence **providers** (`docs/existing-intelligence.md`).

The Overview already embodies this split: *Understanding* (this engagement) vs
*Recall* (what we know). Engagement Context extends the "this engagement" side with
structured metadata — some **auto-extracted from the brief** by the Understanding
analyst (deadline, deliverables, budget, markets, audiences), the rest entered.

**Field sensitivity (the critical rule).** Each Engagement Context field carries a
sensitivity: `external_safe` or `internal_only`. Internal-only fields — commercial
context, budget/margin assumptions, internal notes, pitch strategy, competitive
positioning, partner pricing — are stored but **never appear in any external-facing
serialisation**: shared outputs, AI retrieval reachable by external users, or
client-facing workspace views. Sensitivity is a property of the field, enforced at
every externalisation boundary, not a display toggle.

## 4. Role/capability access + internal-by-default visibility

The platform already has the exact precedent: **`canPresentSimulations`** — a
per-user *capability* (not a role), checked separately from role, admins always
pass, and it gates `simulated`-project visibility in the list route and creation.
And **`organisationType === "internal"`** already exists (Fanometrix's own org
type). We mirror this rather than invent a parallel model.

**Capability model (action-aware, splittable):**
- v1 ships **one** per-user capability `can_access_internal_engagements` (column on
  `users`, surfaced on `AuthedUser`), checked **separately from role** and named for
  *internal engagements* generally — not RFP specifically.
- The resolver is **action-aware from day one**: `can(user, action, engagementType)`
  where `action ∈ view | create | edit | export`. Today, for any `internal`
  engagement type, all four actions resolve to `admin || canAccessInternalEngagements`;
  a non-internal type resolves to the normal path. **Splitting later** (viewing,
  creating, editing, exporting internal engagements as *separate* capabilities —
  `export` is the likeliest first split, as it governs producing shareable artefacts)
  changes only the resolver mapping, **never the call sites**.
- **Grant rule:** admins always pass; otherwise the explicit per-user flag; **org
  membership (incl. `organisationType==='internal'`) never grants it** — "authorised
  to see confidential internal work", not merely "works at Fanometrix". Default denied.

**Internal-by-default visibility:**
- Internal engagement types default to **internal** visibility, per the type's
  registry entry (`default_visibility`). Reuse the governance model
  `library_documents` already defines (`visibility ∈ project|organisation|internal|
  platform`, `ai_access`, `GOVERNANCE_DEFAULTS` = internal-by-default) — add a
  `visibility` column to `research_projects` on the same enum: `organisation` for
  `research_study`, `internal` for internal types (e.g. `rfp_response`).

**Defense in depth — enforced at three layers (never "just hide the button"):**
1. **UI** — the "RFP / Pitch Response" purpose option renders only with
   `can_create`; RFP projects appear in lists only with `can_view`.
2. **Server** —
   - *Create* (`app/api/research-projects` POST): reject `project_purpose='rfp_pitch'`
     without `can_create` → 403.
   - *List* (`…/route.ts` GET): filter out RFP projects without `can_view` —
     **exactly where `visibleSimulated` is gated today** (the proven chokepoint).
   - *Detail* (`…/[id]` GET): `canAccess` + purpose/visibility check → **404** for
     non-cleared (never confirm existence).
   - `lib/access.ts visibleResourceIds` excludes RFP projects for non-cleared users,
     so every consumer of that helper inherits the rule.
3. **Data / AI retrieval** — the Existing Intelligence providers
   (`research-library`, `previous-projects`) and any RAG must exclude RFP-internal
   content for non-cleared viewers.

**Honest finding (a real prerequisite, not free).** The governance read/AI
enforcement functions (`documentVisibleToViewer`, `canAIReadDocument` in
`lib/library-documents/governance.ts`) are **defined but not wired into any
read/AI-retrieval site** today. The AI providers currently scope only by
org-ownership + approval status — so as built they *would* leak internal content.
Internal-by-default RFP therefore **requires wiring the dormant read-side and
AI-retrieval enforcement** as part of this work. This is the one place the
extension is not just additive.

## 5. Adaptive outputs & deliverables

- **Requested Deliverables vs Fanometrix Recommended Deliverables.** Requested
  deliverables are extracted from the brief (Engagement Context). *Recommended*
  deliverables are system-proposed additional outputs that would materially
  strengthen the response — clearly **marked as recommendations**, never presented
  as items from the brief. (This extends the Overview's "reflect with insight" +
  recommendation pattern to the output layer.)
- **Outputs adapt by purpose** from the *same* evidence: research_study → research
  report / conclusions / key findings; rfp_pitch → the pitch-deck sections
  (strategic interpretation, fan/audience insight, activation principles, creative
  territories/stimulus, media & partner recommendations, market approach,
  measurement framework, evidence appendix, access & visibility). One evidence
  spine; purpose-aware output templates.

## 6. Partner Intelligence — a new provider on the existing seam

Partner Intelligence **plugs into the Existing Intelligence provider architecture**
(`docs/existing-intelligence.md`) — no new architecture. A **House** provider
(Fanometrix/TFC's own knowledge) that, once partner records exist (markets, reach,
audience profile, formats, editorial/social/push/display/video/branded-content/
survey capabilities, impressions, pricing, terms, lead times, restrictions, prior
campaigns, benchmarks, relationship status, contacts), surfaces the partners
relevant to an engagement.

Two roles, one store:
- as a **provider**, it contributes grounded "what partners are available/relevant"
  findings to Recall;
- at the **output** layer, a partner-recommendation module reads the same store to
  recommend partners by strategic role, market suitability, audience fit, execution
  capability and commercial practicality — an RFP output.

**Access:** the whole provider is internal-only. Partner pricing, commercial terms,
relationship notes and internal assessments are `internal_only` and never surface
to external users or in external AI retrieval. The provider registers/returns only
for cleared users / RFP projects.

## 7. Separation — internal working material vs shareable deliverables

Sharing a pitch does not expose the working project. Three classification layers,
applied uniformly:
1. **Project visibility** — internal by default for RFP (the working project stays
   internal).
2. **Field sensitivity** — `internal_only` Engagement Context / partner / commercial
   fields are never externalised.
3. **Output shareability** — a specific deliverable can be explicitly shared, which
   produces a **derived, sanitised artifact** that excludes all internal material —
   never a view into the project.

Principle: **sharing is additive and explicit at the output level, and produces a
sanitised derivative.** A shared pitch deck omits commercial notes, partner pricing,
competitive positioning and draft thinking by construction. (Maps to the existing
published-artifact/report model.)

## 8. Strategic & creative development — intellectual honesty

The platform may generate strategic and creative stimulus, but must never present
unvalidated thinking as established evidence. Every strategic/creative element
carries an **evidential-status label** — the same discipline as the platform's
provenance / evidence-strength / authored-vs-measured rules:
- **Evidence-backed strategic opportunity** — grounded in real findings; cites its
  sources (like an Existing Intelligence finding, with evidence strength).
- **Creative hypothesis / territory** — a plausible direction, explicitly
  unvalidated.
- **Fully developed creative idea** — creative execution, clearly not evidence.

Evidence-backed items must cite; hypotheses and creative are visibly marked as such.
This is the RFP-stage expression of the platform's core honesty principle.

## 9. Domain-model impact (additions, not changes)

New authored engagement/design concepts to record in `docs/research-project-domain.md`:
- **Project Purpose** (engagement fact on the Project).
- **Engagement Context** (engagement facts, with per-field sensitivity).
- **Engagement Type** (registry-driven, extensible) with its **Success Definition**
  (the objective — when complete) and **Output Profile** (default deliverables,
  intended audience, evidence threshold, presentation style — what a good output
  looks like). These parameterise readiness, Planning success, Analysis and Outputs;
  authored, instance-refinable, and never change the workflow. The **evidence
  threshold** feeds the existing readiness/confidence machinery directly.
- **Visibility** on the Project (internal-by-default for internal types) + the
  capability model.
- **Deliverables** (Requested vs Recommended) and purpose-adaptive Outputs.
- **Partner Intelligence** as a House provider on the Existing Intelligence seam.
- **Evidential-status labelling** for strategic/creative content.
- The **separation invariant**: internal working material vs sanitised shareable
  deliverables.

The shared spine, the Research Design, Information Needs, Method Assignment and the
authored-vs-measured discipline are unchanged.

## 10. Honest findings & risks

1. **Read/AI enforcement is dormant.** `documentVisibleToViewer` / `canAIReadDocument`
   exist but are unwired; the AI providers scope by org + approval only.
   Internal-by-default RFP requires wiring them — a genuine prerequisite.
2. **AI-retrieval leak points** are concrete: `providers/research-library.ts` and
   `providers/previous-projects.ts`. RFP filtering must be added there.
3. **Sharing needs a sanitised-derivative mechanism** so shared outputs provably
   exclude internal fields — design it as *export a new artifact*, never *expose the
   project*.
4. **Capability granularity** — create vs view; recommend both grants, admins +
   internal-org default; external explicit-grant only.

## 11. Proposed build phasing (later — not now)

1. **Engagement Type + capability + internal-by-default enforcement** — the
   `engagement_type` column + registry, the `can_access_internal_engagements`
   capability on `AuthedUser` via an action-aware resolver, and the three-layer
   enforcement (UI option, create/list/detail server checks, provider filtering +
   wiring the dormant AI-read gate). *Security-first: land the access model before
   any internal-engagement content exists.* (Plan: `docs/rfp-phase1-plan.md`.)
2. **Engagement Context** — the structured capture in the Overview, field
   sensitivity, brief auto-extraction; separated from Organisation Intelligence.
3. **Adaptive outputs** — Requested vs Recommended deliverables; type-aware
   Output templates (report vs pitch-deck sections); Analysis emphasis by type.
4. **Partner Intelligence** — the partner store + the House provider + the
   partner-recommendation output module (internal-only).
5. **Strategic/creative honesty** — evidential-status labelling across
   strategic/creative content.

## 12. Sequencing (do not delay Overview & Planning)

This whole extension is **additive and security-first**, and it is **queued behind
the current work** — it must not delay completing the Overview and the Planning
stage. Recommended order:

1. **Finish the Overview** — user review of the live page (migrations 127–129),
   optional Recall/synthesis caching.
2. **Planning slices 1–3.**
3. **Engagement-Type Phase 1** (the access model above).

The security-first invariant holds naturally: **no internal engagement can be
created until Phase 1 exists**, because Phase 1 *is* what enables creating one — so
the access model necessarily precedes any internal content. There is therefore no
pressure to build Phase 1 before Overview/Planning; only before the first internal
engagement.
