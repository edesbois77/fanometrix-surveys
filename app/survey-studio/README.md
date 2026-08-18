# Survey Studio — architecture & invariants

Orientation for anyone working in `app/survey-studio/**` and `app/components/studio/**`.
This is a short index of **established decisions** so they don't get rediscovered or
accidentally reversed. It is not the product spec (see the Product Blueprint) nor the
build plan (see `~/Downloads/Survey-Studio-Create-V1-Implementation-Plan.md`); each
invariant links to the authoritative code.

## Shell & IA

- **The Fanometrix logged-in shell is established — do not redesign it.** Navy global
  header (`app/components/studio/GlobalShell.tsx`) → light contextual product sidebar
  (`StudioSidebar.tsx`) → workspace, composed by `StudioShell.tsx` and mounted only for
  `/survey-studio/*` via `app/survey-studio/layout.tsx`. It is additive: it replaces no
  existing route and reuses the global `SessionProvider` unchanged.
- **Survey Studio IA is fixed: Home / Create / Request / Discover / Manage.** The single
  source is `lib/studio-nav.ts` (`STUDIO_NAV`). Nav visibility is UX projection only.
- **Lower-level navigation lives inside the workspace, never as sidebar children.** The
  per-area local nav (e.g. Create's stage tabs) renders in the content column beneath the
  title (`app/components/studio/create/StageTabs.tsx`). The sidebar stays a single flat level.
- **Home is adaptive, not a fixed dashboard.** `app/components/studio/home/StudioHome.tsx`
  renders conditional, priority-ordered sections from read-only data; there is no permanent
  KPI strip. Do not reintroduce a fixed operational dashboard.

## Create lifecycle

- **`/survey-studio/create` is a non-side-effecting landing.** It creates nothing on load
  (`app/components/studio/create/CreateLanding.tsx`); it only reads `GET /api/surveys`.
- **"New survey" is the only draft-creation action** — the sole caller of `POST /api/surveys`.
- **"Resume draft" reopens the most recent accessible in-progress draft** owned by the
  current user, routing to `/survey-studio/create/[surveyId]?stage=about`.
- **A Create draft IS the existing `surveys` row (`status='draft'`)** — no new draft model,
  store, or parallel persistence. Editing is `GET`/`PUT /api/surveys/[id]`.
- **`/survey-studio/create/[surveyId]` is the persistent workspace** (`CreateWorkspace.tsx`).
  Manage will reopen existing surveys into this same workspace; do not build a second editor.
- **Stages are About → Creative → Survey → Campaigns → Deploy, and are freely navigable**
  (not wizard-locked). Stage identity travels as `?stage=`, so the survey ID stays in the path.
- **Autosave runs against the existing survey** — debounced, serialised, no-clobber, with
  `Saving… / Saved just now / error` (`useAutosave.ts`), writing via `PUT /api/surveys/[id]`.
  About = Phase 1 (`AboutStage.tsx`); Creative/Survey/Campaigns/Deploy are placeholders
  (`StudioPlaceholder`) pending later phases.

## Platform ownership & reuse

- **Current Organisation, identity, membership, Product Access, capabilities and resource
  authorisation are platform-owned.** Consume them via `useSession()` /
  `requireUser()` / `lib/access.ts`. **Survey Studio must not create local role- or
  organisation-derived permission logic** (no role/org-type/domain/id shortcuts).
- **Q-09 vs Q-10.** Q-09 Product Access decides whether Create is available at all (the
  existing `requireUser(req, ["admin","publisher"])` gate on `/api/surveys`). Narrower
  distinctions are governed Q-10 **Product Capabilities**.
- **`create-commissioned-research` is a governed Q-10 capability** (defined in
  `lib/authz/product-access.ts`; V1 policy: contextual Fanometrix/admin ALLOW, Publisher/
  non-admin REFUSE; no stored grant column). Survey Studio **consumes** it via
  `lib/survey-create-capability.ts` → `hasCapability(...)` and **never owns the policy**.
  The About → Purpose guardrail is enforced server-side at the `/api/surveys/[id]` write
  boundary; the UI is projection only.
- **Reuse/extend, don't replace.** Build Create over the existing Survey, Creative,
  Campaign, Deploy and measurement architecture (see the audit + implementation plan for
  the REUSE / ADAPT / MIGRATION / NEW classification). Do not fork parallel Survey Studio
  versions of these.
- **Production/legacy data must remain intact during the transition.** Schema changes are
  additive/nullable; the legacy survey editor stays available under Archive / Legacy.
  Migration 179 (`surveys.about jsonb`) is applied.
