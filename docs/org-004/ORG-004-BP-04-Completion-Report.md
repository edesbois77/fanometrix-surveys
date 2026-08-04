# ORG-004 — Organisational Office & Office-Holding (BP-04) — Completion Report (Final, canonical record)

> **CONTROL REVIEW: PASS — CLOSED.** Migrations 158, 159, 160 are APPLIED to production and
> VERIFIED. Phase B (Office application layer) is implemented; all code/test/lint/build gates
> pass; read-only production sanity is clean. The external holder-subject dependency is
> **preserved and database-enforced**; no Person/Actor/holder architecture, no Authority, no
> Platform-Authorisation change. 30/30 FRs dispositioned; 0 blocking findings; 0 Tier-3 findings.
> This document is the permanent, version-controlled BP-04 implementation completion record.

## 0. Final Determination

**BP-04: PASS — CLOSED.**

## 1. Executive Summary

BP-04 implements the governed Organisational Office (IC-08) and the office-holding *mechanism* faithfully to the 30 R06 FRs and the ORG-003 disposition, under control determinations F-1/F-2/F-3. The **Office subject, structural attachment, canonical Office facts, and ordinary Relationship participation** are fully implemented and usable. **Office-holding is a governed mechanism (a system relationship type) whose actual instances remain unavailable** — the external holder-subject dependency (FR-018) is deliberately preserved and enforced in-database, with **no phantom/synthetic holder** and the >=2 invariant intact. BP-01–BP-03 remain intact; no BP-05/Authority structures exist.

## 2. Migration Evidence (applied + verified)

| Migration | Applied | Purpose |
|---|---|---|
| 158 | yes | Organisational Office subject core: `organisation_offices` (existence + applicability + registry admission as `organisational_office`) + `organisation_office_attachments` (governing org + optional unit + applicability + unit-belongs-to-governing-org guard; `organisation_units` untouched) |
| 159 | yes | F-3 additive widening: admit `organisational_office` to the `subject_kind` CHECKs on `organisation_names`, `organisation_identifiers`, `classification_assignments` (FR-002) and `organisation_relationship_participants` (FR-017) |
| 160 | yes | F-1 office-holding mechanism: seed `office_holding` system relationship type (FR-016) + preserved-dependency guard rejecting office-holding **instances** until a holder subject exists |

The `supabase-migration-158-160-verify.sql` suite ran in production without error and reached its final preservation row (Organisations 84; Offices 0; Attachments 0; Relationship types 3; Office subjects 0; Internal unchanged 2). Read-only sanity confirms the same.

## 3. Phase B Implementation (services / APIs / UI)

- **Service** `lib/organisations/offices.ts`: `listOfficesForOrganisation`, `createOffice` (create + attach), `getOffice`, `correctOffice`, `ceaseOffice`, `retireOffice`; attachment `listAttachments`, `attachOffice`, `updateAttachment`, `retireAttachment` — all enforcing the FR-010 exclusivity invariant.
- **Pure logic** `lib/organisations/bp04.ts` (+ tests): half-open `intervalsOverlap` and `validateAttachmentExclusivity` (FR-010). `bp02.ts`/`bp03.ts` additively admit `organisational_office` as an eligible fact subject (FR-002) and relationship participant (FR-017), mirroring migration 159.
- **APIs** (4 admin-only routes): `[id]/offices`, `offices/[officeId]`, `offices/[officeId]/attachments`, `office-attachments/[attachmentId]`. Office canonical Names/Identifiers/Classifications and ordinary Relationship participation **reuse the existing BP-02/BP-03 services** (office is now an admitted subject kind).
- **UI**: an **Offices** tab on `/organisations/[id]` — create + attach (direct or via a Unit), cease, retire, add an Office canonical Name; and a note that office-holding is a present mechanism whose actual holdings remain unavailable (holder dependency preserved). Extends the existing detail experience; no parallel product; no unrelated page changed.

## 4. FR-010 temporal invariant (control-required, explicitly implemented + tested)

**FR-010 — exactly one governing Organisation for an Office at each applicable structural-attachment point** is implemented in the service/interpretation layer (migration 158 documents it is not a DB non-overlap constraint) as **attachment-interval exclusivity**: `validateAttachmentExclusivity` rejects any attachment whose half-open `[from, to)` overlaps another non-deleted attachment of the same Office, guaranteeing at most one applicable attachment (hence exactly one governing Organisation) at every point. `attachOffice` and `updateAttachment` both apply it. **Tested:** `bp04.test.ts` — non-overlapping/adjacent accepted, overlapping rejected (with the conflicting id), self-edit permitted, reversed/zero-length rejected; the DB still enforces one `governing_organisation_id` per attachment and valid half-open intervals.

## 5. Preserved external dependency (control-required record)

The **R06 external holder-subject dependency is preserved**. BP-04 created **no** Person, Actor, holder registry, phantom holder or synthetic holder. The `office_holding` mechanism/type exists (FR-016), but the migration-160 guard rejects creation of any office-holding **instance** with `raise_exception` ("holder subject architecture is a preserved external dependency"). The >=2-participant Relationship invariant is untouched. Office-holding instances will become available only when a future package admits an eligible holder subject under its own governing subject architecture, at which point the guard is removed.

## 6. 30/30 FR Disposition

**Implemented (14):** FR-001 (Office subject), 002 (canonical facts), 003 (persistence), 007 (Office applicability), 008 (derived state), 010 (one governing Org — §4), 011 (direct/Unit attachment), 012 (Unit belongs to governing Org), 013 (attachment != Unit containment), 014 (attachment change), 015 (attachment applicability), 016 (office-holding mechanism/type), 017 (Office as participant), 023 (Office applies from applicability).

**Bounded / negative (7):** FR-004, 005, 006 (Office not replaced by title/id/class/authority/org changes, relocation, non-deterministic transformation); 009 (no Authority inferred from Office); 020 (no eligibility/qualification determination); 029 (no unknown/disputed/source-relative temporal); 030 (no proposal-as-fact).

**Externally dependent — PRESERVED holder-subject (8):** FR-018 (holder participant — the preserved dependency), 019, 021, 022, 024, 025, 027, 028 (holder roles / mechanism-agnostic / cardinality / holding + succession interpretations — ready once holdings exist; instances blocked by the migration-160 guard).

**Interpretable now (1):** FR-026 (vacancy) — an applicable Office with no applicable office-holding is vacant; since no holdings can yet exist, every applicable Office is correctly vacant, and this remains correct when holdings are later admitted.

**Total: 30/30 dispositioned** (14 implemented + 7 bounded + 8 externally-dependent-preserved + 1 interpretable).

## 7. Bounded exclusions

R06-BE-01..06 CONSERVED and honoured as absent capabilities: no source-relative/competing/evaluative Office or office-holding information; no unknown/approximate/disputed/source-relative temporal (single canonical half-open dates); no proposal/plan/intention as fact; and — per the brief — no Person/Actor model, no Organisational Authority, no Platform-Authorisation change, no universal Status/History, no Evidence/Provenance/Confidence/Acceptance.

## 8. Tests & Gates

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **PASS** (0) |
| Full suite | `npm test` | **PASS — 249/249** (243 prior + 6 bp04; two BP-02/BP-03 exclusion tests updated for F-3) |
| Lint (all BP-04 files) | `npx eslint lib/organisations app/api/organisations app/organisations/[id]/page.tsx` | **PASS** (0) |
| Production build | `npm run build` | **PASS** — compiled; office routes registered |
| DB integrity (control-run) | `supabase-migration-158-160-verify.sql` | Completed without error; final preservation row as expected |

## 9. Read-only Production Sanity

organisations **84**, organisation subjects **84**, primary names **84**, current classification assignments **82**; `organisation_offices` **0**, `organisation_office_attachments` **0**, office subjects **0**; relationship types **3** (`membership`, `lineage_predecessor_successor`, `office_holding`); `organisation_authorities`/`office_holdings` **absent**.

## 10. Compatibility / Regression

No existing schema or behaviour changed by Phase B. **NOT AFFECTED:** Organisations admin, User Management, Platform Authorisation, Campaigns/Groups, Research Projects, Surveys, Creative Designs, Documents, Partner Reports, reporting/views, selectors. All 84 Organisation UUIDs and downstream references stable. The BP-02/BP-03 fact and relationship services continue to accept the original kinds (verified) and now additionally accept `organisational_office`; invalid kinds still rejected. Offices/attachments/relationships grant zero platform permissions.

## 11. Architecture / Scope Confirmation

BP-04 introduced **no**: Person/Actor/holder architecture, Organisational Authority (BP-05), Platform-Authorisation change, universal Status/History/lifecycle, Evidence/Provenance/Confidence/Acceptance, duplicate/entity resolution, or any excluded dependency. Unit constitutive containment remains Unit-owned (FR-013). IC-01 was extended only by admitting the reserved `organisational_office` kind.

## 12. Git / Deployment State (at completion)

- **Branch:** `org-004-bp03` (off `org-004-bp02`). Not pushed, not merged, not deployed.
- **Key BP-04 commits:** `59f62ce` (Phase A: 158/159/160 + verify), `acbb63e` (Phase B: offices service/APIs/UI + bp04 + widenings). Migrations 158–160 applied to production and verified.
- **Production data:** preserved — 84 Organisation UUIDs and all BP-01/02/03 rows intact; Office tables empty; 3 relationship types.

## 13. Control Determination

Control review: **PASS — COMPLETE**. Blocking findings: 0. Tier-3 unresolved implementation findings: 0. The external holder-subject dependency was correctly preserved rather than resolved through unsupported Person/Actor/holder architecture. BP-05 authorised to begin.

**BP-04: PASS — CLOSED.**
