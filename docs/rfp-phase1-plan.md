# Phase 1 — Internal RFP Access (security-first) — implementation plan & test matrix

**Status:** Implementation plan for review before build. Security-first slice of
`docs/engagement-types.md`. Scope is access & enforcement ONLY — no Engagement
Context, no pitch outputs, no Partner Intelligence.

**Hard rule:** this slice lands and is proven by tests **before any RFP content is
created**. Hiding an RFP project from navigation while its documents remain
AI-retrievable is the appearance of security, not security.

---

## 1. Scope (confirmed)

Add `project_purpose`; add one capability `can_access_internal_rfp`; make
`rfp_pitch` projects **internal by default**; enforce at UI + create + list +
detail + providers + search + AI retrieval + reports/export + platform learning;
wire the dormant governance read/AI gates; prove it all with tests. Nothing else.

## 2. Data model (migrations)

**Migration A — `research_projects`:**
- `engagement_type text NOT NULL DEFAULT 'research_study' CHECK (engagement_type IN ('research_study','rfp_response'))` — extensible enum; new internal types (client_brief, internal_strategy, partnership_planning…) are added here + in the registry, with no enforcement change.
- `visibility text NOT NULL DEFAULT 'organisation' CHECK (visibility IN ('project','organisation','internal','platform'))`
- `ai_access text NOT NULL DEFAULT 'organisation' CHECK (ai_access IN ('project','organisation','internal','platform'))`
- `learning_permission text NOT NULL DEFAULT 'no_learning' CHECK (learning_permission IN ('no_learning','anonymous','aggregated','platform'))`
- Index on `engagement_type`; partial index `WHERE engagement_type='rfp_response'`.
- **Existing study projects are unaffected** — defaults reproduce today's behaviour
  (organisation-scoped, AI-usable within org). Only creation of an **internal**
  engagement type sets the internal-by-default trio (`visibility='internal',
  ai_access='internal', learning_permission='no_learning'`), applied in the create
  path (§4) from the type's registry entry, not by column default — so a study never
  accidentally becomes internal.

**Migration B — `users`:**
- `can_access_internal_engagements boolean NOT NULL DEFAULT false` — mirrors
  `can_present_simulations` exactly (a capability grant, not a role).

**Engagement-type registry** (`lib/engagement-types.ts`, config not schema): each
type declares `{ internal, default_visibility, capability }`. v1: `research_study`
(external, organisation) and `rfp_response` (internal, capability-gated).
Enforcement reads the registry — it never hard-codes a type id.

## 3. Capability layer (action-aware, splittable by design)

New `lib/capabilities.ts` — the single source of capability truth:
- `can(user, action, engagementType): boolean`, `action ∈ 'view' | 'create' |
  'edit' | 'export'`. Today, for an **internal** type, all four actions resolve to
  `user.role === 'admin' || user.canAccessInternalEngagements`; a non-internal type
  resolves to the normal path. **Splitting later** (separate view/create/edit/export
  capabilities — `export` likely first, as it governs producing shareable artefacts)
  = change this resolver only; **no call-site changes**.
- `AuthedUser` gains `canAccessInternalEngagements: boolean` (populated in
  `lib/auth-server.ts` from the column; admins forced true), mirroring
  `canPresentSimulations`.

**Grant rule:** admins always pass; otherwise the explicit per-user flag; **org
membership (incl. `organisationType==='internal'`) never grants it**; default
denied.

## 4. Enforcement points (every surface)

A central project-access helper so every surface shares one rule (and it stays
splittable):
- `lib/access.ts` (or `lib/rfp-access.ts`): `canAccessProject(user, projectRow)`
  and `canCreatePurpose(user, purpose)`, both built on `can()`.

| # | Surface | File | Change |
|---|---|---|---|
| 1 | **Create** | `app/api/research-projects/route.ts` POST | `project_purpose==='rfp_pitch'` requires `can('create_internal_rfp')` else **403**; when rfp, set the internal-by-default trio. |
| 2 | **List** | `…/route.ts` GET | Mirror the `visibleSimulated` gate: rfp projects included only if `can('view_internal_rfp')`. |
| 3 | **Visible ids** | `lib/access.ts` `orgWideResourceIds`/`selectedResourceIds` (`research_project`) | Exclude `rfp_pitch` from org-scoped ids (a client org never sees one, even if org-linked). RFP visibility is capability-gated, not org-gated. |
| 4 | **Detail** | `app/api/research-projects/[id]/route.ts` GET (+ PUT/DELETE) | If `project.project_purpose==='rfp_pitch'` and not `canAccessProject` → **404** (never confirm existence). |
| 5 | **Existing-Intel providers** | `lib/intelligence/existing/providers/previous-projects.ts` | Exclude `rfp_pitch` projects entirely — internal work never feeds another project's cross-project retrieval. |
| 6 | **Research-library provider** | `…/providers/research-library.ts` | Wire `canAIReadDocument(doc, scope)`; drop documents whose `ai_access` disallows the viewer's scope; exclude internal docs from non-cleared contexts. |
| 7 | **Gather context** | `lib/intelligence/existing/types.ts` + gather route | Add viewer scope to `IntelligenceContext` (e.g. `viewerCanAccessInternal`, `aiScope`) so providers can enforce. |
| 8 | **Governance gates (wire the dormant fns)** | `lib/library-documents/governance.ts` consumers | Call `documentVisibleToViewer` at every document READ/list site and `canAIReadDocument` at every AI-retrieval site (currently unwired). |
| 9 | **Search** | audit + gate all project/library search endpoints | Route through `canAccessProject` / `documentVisibleToViewer`; rfp/internal never in results for non-cleared. |
| 10 | **Reports / export** | report + export routes | rfp content not exportable to client-facing surfaces; export respects visibility. |
| 11 | **Platform learning** | learning-ingestion site | Wire `canDocumentContributeToLearning`; `learning_permission='no_learning'` rfp content excluded unless explicitly permitted. |
| 12 | **UI** | project-create + list surfaces | RFP purpose option renders only with `can('create_internal_rfp')`; rfp rows only with view. **UI hiding is in addition to, never instead of, server enforcement.** |

**Field-level sensitivity note:** in Phase 1 the *whole* rfp project is internal, so
project-level enforcement subsumes field-level. Phase 1 establishes the single
**externalisation seam** (one serializer boundary) that Phase 2's Engagement Context
internal fields will pass through — but no internal fields are populated yet.

## 5. Internal-by-default (relaxable only by authorised action)

Every `rfp_pitch` project defaults to: `visibility='internal'`, `ai_access='internal'`,
`learning_permission='no_learning'`, no external sharing, no client-workspace
exposure, no cross-org retrieval. Relaxing any of these is an explicit, capability-
gated action (built later); Phase 1 only guarantees the defaults and that nothing
relaxes them implicitly.

## 6. Test matrix (the proof)

**Actors:** `admin`; `cleared` (non-admin, `can_access_internal_rfp=true`);
`internal_uncleared` (internal-org user, flag=false — proves org≠access);
`brand`, `agency`, `publisher` (external); `anon` (unauthenticated).

**Fixtures:** one `rfp_pitch` project `R` (internal) + attached internal library
doc `D`; one `research_study` project `S` (control).

**Assertion grid — `R` (rfp) unless noted; ✅ allow / ⛔ deny:**

| Surface | admin | cleared | internal_uncleared | brand/agency/publisher | anon |
|---|---|---|---|---|---|
| Create rfp (POST) | ✅ | ✅ | ⛔ 403 | ⛔ 403 | ⛔ 401 |
| List includes `R` | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Detail `GET /[id]` `R` | ✅ | ✅ | ⛔ 404 | ⛔ 404 | ⛔ 401 |
| Detail `S` (control) | ✅ | per-org | per-org | per-org | ⛔ |
| Existing-Intel gather surfaces `R`/`D` | ✅ | ✅ (own rfp ctx) | ⛔ | ⛔ | ⛔ |
| `previous-projects` surfaces `R` in **another** project's Recall | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| `research-library` surfaces `D` when `ai_access` disallows | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Search returns `R`/`D` | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Export/report of `R` to client surface | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| `D` enters platform learning (`no_learning`) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |

**Direct-route / defence-in-depth negatives (must all deny for non-cleared):**
- Guessed `GET /api/research-projects/{R.id}` → 404 (not 403 — no existence leak).
- `GET …/{R.id}/existing-intelligence` → no `R`/`D` content in payload.
- Craft a normal study project and confirm `R`'s findings never appear in its
  Recall via `previous-projects` or `research-library`.
- `internal_uncleared` (same org as the rfp's brand) still denied on every row —
  proves org membership grants nothing.
- Capability revoked mid-session → next request denied (state re-fetched per request,
  per `requireUser`).

**Positive controls:** `S` behaves exactly as today for all actors (no regression);
`cleared`/`admin` retain full `R` access on every surface.

## 7. Sequencing within Phase 1

1. Migrations A + B.
2. `AuthedUser.canAccessInternalRfp` + `lib/capabilities.ts` + `canAccessProject`.
3. Create + list + detail enforcement.
4. `lib/access.ts` id-scoping exclusion.
5. Provider + gather-context + governance-gate wiring (the security core).
6. Search + export + learning wiring.
7. UI gating (last — it is cosmetic relative to the server).
8. Tests for the full matrix; run them; verify red→green on each enforcement point.

## 8. To confirm before code

1. **Search & learning surfaces:** the recon didn't enumerate a global search or the
   platform-learning ingestion site. I'll **grep and audit** these first and report
   the exact endpoints before gating them — flagging any I can't find so none is
   silently missed.
2. **Test runner:** confirm the project's test setup (framework + how to run) so the
   matrix is executable, not just described. (I'll detect it before writing tests.)
3. **`ai_access` vs `visibility` on projects:** I've mirrored the library model with
   both; if you'd prefer a single `visibility` axis governing human+AI for v1, say so
   — I can collapse them and split later.
