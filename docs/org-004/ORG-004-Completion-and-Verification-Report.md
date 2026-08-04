# ORG-004 — Organisations Programme — Completion & Verification Report

> **Scope:** final closure inspection across Build Packages BP-01 → BP-05. Inspection-only:
> no schema migration or application change was made during this closure (read-only probes +
> code gates). Governing principle honoured throughout: *evolve the existing Organisations
> implementation; do not replace it* — all original `organisations.id` UUIDs and downstream
> references preserved; the database remains authoritative for structural/domain integrity.
>
> **Determination: ORG-004 (BP-01..BP-05) COMPLETE — proposed for programme closure.**

## 1. Consolidated implementation status

| BP | Interpretation Component(s) | Deliverable | Migrations | Control status |
|----|------|-------------|-----------|----------------|
| **BP-01** | IC-01 Subject Foundation + IC-02 Organisation Core registration | `organisation_subjects` referencing substrate; existing Organisations registered as subjects; legacy model unchanged | 149 | **CLOSED — PASS** |
| **BP-02** | IC-03 Units; IC-04 Names / Identifiers / Classification | Units tree; canonical Names, Identifiers; Classification schemes/categories/assignments; half-open applicability | 150, 151, 152, 153 | **CLOSED — PASS** |
| **BP-03** | IC-05 Organisational Identity (R03); IC-07 Relationship substrate (R05) | `organisation_identities`; `organisation_relationships` (+participants, `relationship_types`); atomic-create RPC; trigger hardening | 154, 155, 156, 157 | **CLOSED — PASS** |
| **BP-04** | IC-08 Organisational Office (R06); IC-07 office-holding | `organisation_offices` + structural attachments (FR-010 exclusivity); office admitted as subject kind; office-holding mechanism with **preserved holder dependency** | 158, 159, 160 | **CLOSED — PASS** |
| **BP-05** | IC-09 Organisational Authority (R07) | `organisation_authorities` (non-first-class fact) + constraints + bases; externally-governed holder-kind registry + eligibility guard; FA-B/FA-D service+pure cores | 161, 162 | **CLOSED — PASS** |

All five packages ran the governed Phase A (design/STOP) → control review → apply-by-hand → Phase B
(build/verify) sequence and reached control PASS.

## 2. Migration inventory and production state

**Applied migrations (13):** all applied by the operator by hand and production-verified.

| # | BP | Purpose | Applied |
|---|----|---------|---------|
| 149 | 01 | `organisation_subjects` (IC-01) + register Organisations (IC-02) | ✅ |
| 150 | 02 | `organisation_units` (IC-03) | ✅ |
| 151 | 02 | `organisation_names` (IC-04) | ✅ |
| 152 | 02 | `organisation_identifiers` (IC-04) | ✅ |
| 153 | 02 | Classification schemes/categories/assignments (IC-04) | ✅ |
| 154 | 03 | `organisation_identities` (R03/IC-05) | ✅ |
| 155 | 03 | Relationship substrate (R05/IC-07) | ✅ |
| 156 | 03 | Atomic relationship-create RPC (≥2 participants) | ✅ |
| 157 | 03 | Tier-2 fix: harden 155 trigger fns (`search_path=''`, schema-qualified) | ✅ |
| 158 | 04 | `organisation_offices` + attachments (R06/IC-08) | ✅ |
| 159 | 04 | Admit `organisational_office` subject kind (F-3) | ✅ |
| 160 | 04 | Office-holding mechanism + **preserved-dependency guard** | ✅ |
| 161 | 05 | `organisation_authorities` + holder-kind registry + eligibility guard | ✅ |
| 162 | 05 | Authority constraints + bases (ref-shape CHECK) | ✅ |

**Verification suites (not migrations):** `149-verify`, `150-153-verify`, `154-155-verify`,
`154-156-verify`, `156-verify`, `158-160-verify`, `161-162-verify` — all `BEGIN..ROLLBACK`, control-run.

**Production state (read-only probe, this inspection):**

```
organisations                          84      organisation_identities                0
organisation_subjects                  84      organisation_relationships             0
organisation_units                      0      organisation_relationship_participants 0
organisation_names                     84      relationship_types                     3
organisation_identifiers                0      organisation_offices                   0
classification_schemes                  1      organisation_office_attachments        0
classification_categories               3      authority_eligible_holder_kinds        0
classification_assignments             82      organisation_authorities               0
                                               organisation_authority_constraints     0
                                               organisation_authority_bases           0
```

All 18 ORG-004 tables exist. Populated counts (84 names, 82 classification assignments, 1 scheme /
3 categories, 3 relationship types) reflect real BP-02 adoption; empty fact tables reflect features
established but not yet populated (including the deliberately preserved-unavailable Authority and
office-holding facts).

## 3. Preservation of the 84 Organisations and downstream compatibility

- **Organisations: 84 total** (79 currently live; **5 pre-existing soft-deletes** from 2026-07-07 —
  legacy/test records: *Carslberg, QA E2E Verification, Test, Verify Test, "Women's World Cup"*).
  These 5 predate the ORG-004 fact work and are part of the canonical 84; they are preserved, not
  introduced or removed here.
- **Subject mapping is 1:1 and exact:** 84 `organisation`-kind subjects; **0 organisations without a
  subject row; 0 subject rows without an organisation.** `subject_kind` distribution = `{organisation: 84}`.
  Every original `organisations.id` UUID is referenceable through the IC-01 substrate.
- **Legacy compatibility projections intact:** the legacy `organisations` row (name/type/status)
  remains the authoritative account record; canonical Names/Identifiers/Classifications are additive
  overlays. No FK from any downstream consumer was repointed or broken; all ORG-004 objects are
  additive.

**Conclusion: original UUIDs and downstream references fully preserved.**

## 4. Consolidated code evidence (this inspection)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **PASS** (0) |
| Full test suite | `npm test` | **PASS — 257/257** (0 fail, 0 skipped) |
| Lint | `npx eslint lib/organisations/ app/api/organisations app/organisations/[id]/page.tsx` | **PASS** (0) |
| Production build | `npm run build` | **PASS** — compiled |

Domain test coverage: `bp02` (units/names/identifiers/classification/applicability),
`bp03` (identity/relationships/temporal), `bp04` (office attachment exclusivity), `bp05`
(holder-eligibility over the admitted set, constraint dimension, FA-D temporal, FR-013 determination),
plus `service` integration helpers.

## 5. Deliberately preserved / deferred dependencies and bounded exclusions

**Preserved external dependencies (DB-enforced, verified live):**
- **BP-05 Authority holder eligibility** (R07 FR-002 / BE-01): `authority_eligible_holder_kinds`
  seeded empty + `enforce_authority_holder_eligibility` guard. Probe: an Authority insert with an
  `organisation` holder was **rejected (P0001)** and persisted nothing; authorities remain 0. No
  holder kind is eligible merely by existing.
- **BP-04 office-holding** (external holder-subject dependency): office-holding mechanism established
  (migration 160) with its guard; actual holdings remain unavailable and are not fabricated.

**Bounded exclusions (honoured, nothing built):**
- No Person/Actor/universal-holder architecture (confirmed absent — see §6).
- Authority bases Delegation / Agency / Appointment / Election / Removal / Contract / statute /
  governing-rule are **reference-only**; R07 owns none of their semantics (BE-02..05).
- No Evidence / Provenance / Confidence / Acceptance / uncertain-or-proposed temporal (BE-06).
- Organisational Authority remains **non-first-class** (not in `organisation_subjects`; no
  Name/Identifier/Classification/Relationship/lifecycle).
- **Platform Authorisation untouched** — RLS deny-anon on all ORG-004 fact tables; no auth path
  references them; a real-world fact grants zero platform permissions.

## 6. Confirmation: no ORG-005+ work implemented

Read-only existence check — all candidate ORG-005 architecture tables are **ABSENT** (PostgREST
PGRST205):

```
persons  ·  actors  ·  organisation_actors  ·  organisation_persons  ·
authority_delegations  ·  authority_agencies    → all ABSENT
organisations                                    → EXISTS (control)
```

No Person/Actor subject architecture, no Delegation/Agency fact tables, no eligible-holder admission.
Nothing belonging to ORG-005 or any later programme has been designed, migrated or built.

## 7. Repository state

- **Branch:** `org-004-bp03` (all BP-01..BP-05 work consolidated here).
- **HEAD:** `6021c80` — *feat(org-004-bp05): Organisational Authority Phase B*.
- **Push/merge/deploy:** **never pushed** (no upstream tracking), **not merged** to `main`, **not
  deployed**. Migrations were applied to production by the operator by hand, ahead of any code
  deployment (consistent with the standing DB-ahead-of-code practice).
- **Working tree:** clean with respect to ORG-004; only an untracked `exports/` directory remains
  (unrelated FedEx calibration pack, out of ORG-004 scope).
- ORG-004 commit lineage (BP-01→BP-05) is intact and self-describing; PROPOSED vs applied states are
  recorded in commit messages. `wwc-2027-landing` was not touched by this programme's work.

## 8. Remaining Tier-2 / Tier-3 findings

- **Tier-2:** none open. All engineering decisions were dispositioned at their package's control
  review — BP-02 remediations (A/B + temporal boundary), BP-03 `search_path` hardening (157) and
  atomic-create RPC (156), BP-04 office subject admission (F-1/F-3), BP-05 holder preservation per
  control **J-1** (with J-2..J-5 approved).
- **Tier-3:** none blocking. The preserved holder dependencies (BP-04 office-holding, BP-05 Authority
  holder) are deliberate, DB-enforced, and additively evolvable; they are not defects.
- **Observation (not a defect):** 5 of the 84 Organisations are pre-existing soft-deleted test/legacy
  records registered as subjects at BP-01. This is consistent with UUID/downstream preservation and
  with control's 84/84 baseline; no action required.

**No genuine defect requiring a further migration or application change was identified in this
closure inspection.**

## 9. Proposed programme determination

**ORG-004 (Organisations) — COMPLETE.** BP-01 through BP-05 delivered, applied, production-verified
and control-closed; all governing boundaries preserved; all original Organisation UUIDs and
downstream compatibility intact; no ORG-005+ work begun. Recommended for **formal programme closure**.

Outstanding non-blocking housekeeping (for control direction, not part of closure): decide when
branch `org-004-bp03` should be pushed / merged to `main` and deployed, given the DB-ahead-of-code
posture. No schema or application change is proposed.

Do not begin ORG-005 until authorised.
