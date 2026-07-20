# Fanometrix — Document Governance Model (Phase 1)

> **Status:** Phase 1 shipping. Implements the ownership / learning / exposure
> model from the platform architecture (Chapter 8: *Learning, Ownership &
> Governance*) as a **reusable foundation**, not a one-off NDA restriction. Every
> product that ever touches a document — Research Library, Research Projects, AI
> assistants, Football Intelligence, the Knowledge Graph, benchmarks, platform
> learning — decides access through **one module**: `lib/library-documents/governance.ts`.

---

## 1. The principle — three independent dimensions

Traditional software treats information as public *or* private. The architecture
insists intelligence is more nuanced: **ownership, learning and exposure are
separate concepts** (Chapter 8, "Information Has Three Independent Dimensions").
Every uploaded document is therefore a **governed asset** carrying six fields:

| Field | Question it answers | Values |
|---|---|---|
| **owner** | Who owns the original source? (never transferred by uploading) | Fanometrix · Organisation · Publisher · Licensed Partner · Public |
| **owner_org_id** | Which organisation, when not Fanometrix/public? | any `organisations.id` |
| **confidentiality** | How sensitive is it? | Public · Internal · Confidential · **NDA Restricted** |
| **visibility** | Where may the document itself appear? | Project · Organisation · Internal · Platform |
| **learning_permission** | May observations strengthen platform intelligence? | No Learning · Anonymous · Aggregated · Platform |
| **ai_access** | The widest AI scope that may read it | Project AI · Organisation AI · Internal AI · Platform AI |

Stored on `library_documents` (migration 124). **Ownership never changes** because a
document is uploaded; learning and exposure are governed independently of it.

## 2. Trust-first defaults

Nothing reaches another organisation or the platform without explicit permission.

- **Fresh upload:** owner `Fanometrix`, no owner-org, confidentiality `Internal`,
  visibility `Internal`, learning `No Learning`, AI access `Internal AI`. Usable
  across Fanometrix's own projects; never leaks to a client org or the platform.
- **Existing rows** backfill to exactly this posture — their current admin-only
  shared-library behaviour, unchanged.
- A **client-owned** document is set to owner `Organisation` + its `owner_org_id`
  + confidentiality `Confidential`/`NDA Restricted`, which locks it to that org.

`GOVERNANCE_DEFAULTS` in the module mirrors the DB column defaults exactly.

## 3. The single source of truth — `lib/library-documents/governance.ts`

Every decision is a pure function over the six fields. No product re-implements
the rules; that is what makes governance **architectural, not per-feature**.

- `isOrgRestricted(doc)` — confined to one owning org (NDA-restricted, or
  organisation/project visibility, once an owner-org is set).
- `canAttachDocumentToProject(doc, project)` — **the primary gate.** An
  org-restricted doc may only attach to a project belonging to its owning org
  (brand / agency / publisher). Everything else attaches freely.
- `documentVisibleToViewer(doc, viewer)` — library visibility. Operator (Fanometrix
  admins) see all; an org sees only its own + platform/public docs.
- `canDocumentContributeToLearning(doc)` — **the platform-learning gate.**
  NDA-restricted / no-learning docs never contribute. Every future
  Knowledge-Object / benchmark / Football-Intelligence ingestion must call this.
- `canAIReadDocument(doc, scope)` — AI access. Per-project analysis (scope
  `project`) is always allowed for an already-attached doc; wider org/internal/
  platform assistants require matching `ai_access`.

## 4. Enforcement points (where the functions are called)

1. **Attach** — `app/api/research-projects/[id]/evidence/route.ts` POST: calls
   `canAttachDocumentToProject` before insert. The non-bypassable gate that keeps
   one client's document out of another client's project.
2. **Attach picker** — `app/api/library-documents/route.ts` GET `?project_id=`
   pre-filters candidates to attachable docs; `AttachExistingDocumentModal` passes
   the project id. Defense-in-depth + UX (restricted docs never appear).
3. **Edit / audit** — `app/api/library-documents/[id]/route.ts` PATCH validates and
   audits every governance field (via `library_document_audit`), alongside
   confidentiality. UI: the Governance section of `LibraryDocConfigBody`.
4. **Library visibility** — the GET is admin-only today; `documentVisibleToViewer`
   is ready for the org-facing Library so a doc never appears in another org's view.
5. **Per-project AI analysis** — the document analysts (`gatherDocumentEvidence`,
   `analyseDocumentForProject`, key-findings/executive/full-report) read documents
   **already attached** to the project, i.e. already past the attach gate — so
   per-project AI is inherently authorised. No change needed; the gate lives at
   attach.
6. **Future platform-learning seam** — Knowledge Objects, benchmarks, Football
   Intelligence, cross-project discovery, `promote-approved-metadata` surfacing:
   **must** call `canDocumentContributeToLearning` / `documentVisibleToViewer`
   before ingesting or surfacing a document beyond its owning org.

## 5. The immediate behaviour (NDA Restricted)

A document marked **NDA Restricted** with an owning organisation:
- can only be attached to that organisation's projects (enforced at attach); ✅
- never appears in another organisation's library or attach picker; ✅
- never contributes to Platform Intelligence, Knowledge Objects, benchmarks or
  platform learning (the learning gate returns false); ✅
- is analysed by AI only inside its authorised (owning-org) projects; ✅
- is respected automatically by any future Football Intelligence / cross-project
  discovery, because they consult the same module. ✅

## 6. Invariants

1. **Ownership is permanent** — uploading a document never transfers ownership.
2. **Three independent dimensions** — ownership, learning and exposure are set and
   evaluated separately.
3. **Trust-first defaults** — the most restrictive posture that preserves the
   operator's own workflow; a document leaks nowhere until explicitly widened.
4. **One decision module** — every product routes access through
   `governance.ts`; no feature re-implements the rules.
5. **Learning is earned through corroboration, never copied** — a document's
   *content* stays private; only permissioned, aggregated observations may ever
   feed platform intelligence (Chapter 8). NDA-restricted never does.
6. **Every governance change is audited** — owner / org / confidentiality /
   visibility / learning / AI changes are written to `library_document_audit`.

## 7. Not yet built (later phases)

- The **org-facing Library** (non-admin) that uses `documentVisibleToViewer`.
- **Learning Events / Knowledge Objects / benchmarks** — when built, they consult
  `canDocumentContributeToLearning` as their ingestion gate.
- Extending the same model to **surveys, conversation searches and reports**
  (Chapter 8 treats every source this way) — same three dimensions, same module
  shape.
- Governance capture **at upload time** (owner-org picker in the upload modal);
  today a fresh upload defaults trust-first and is set via the document's
  Governance editor after upload.
