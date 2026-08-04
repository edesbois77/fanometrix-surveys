# ORG-004 BP-05 - Organisational Authority (R07 / IC-09) - Completion Report

> **Status: BP-05 PHASE B COMPLETE - returned for final control review.**
> Migrations 161-162 applied in production and verified by control. This report records the
> Phase B application/service/API/UI layer built over those applied facts, the gate evidence,
> and read-only production sanity confirming every approved boundary is preserved.

## 1. Scope delivered

The minimum application layer for Organisational Authority defined by the approved Phase A package:

- **Pure domain core** (`lib/organisations/bp05.ts`): holder-admission predicates over the governed
  admitted-kinds set; constraint-type / basis-kind vocabularies; FA-B constraint-dimension; FA-D
  half-open temporal state/applicability; and the **FR-013 determination composition**
  (`composeAuthorityDetermination`) - empowered only when the fact applies at the point, the target
  is within scope, and every material constraint is satisfied; insufficient information is
  indeterminate, never a failure (FR-010/012).
- **Service** (`lib/organisations/authorities.ts`): list authorities (with constraints + bases) for
  a principal organisation; read the externally-governed admitted holder-kind registry (read-only);
  create / correct / cease / retire an Authority fact; add / remove material constraints; add /
  remove basis references (internal FK-checked vs external reference-only, mirroring the DB
  ref-shape CHECK); and an FR-013 determination endpoint (interpretation only, persists nothing).
- **API** (six routes): `GET|POST /api/organisations/[id]/authorities`;
  `GET|PATCH|DELETE /api/organisations/authorities/[authorityId]` (PATCH = correct / cease /
  determine); `POST .../authorities/[authorityId]/constraints`; `POST .../authorities/[authorityId]/bases`;
  `DELETE /api/organisations/authority-constraints/[constraintId]`;
  `DELETE /api/organisations/authority-bases/[basisId]`. All admin-gated via `requireUser(..,["admin"])`.
- **UI** (`app/organisations/[id]/page.tsx`): a new **Authorities** tab - lists authority facts with
  holder / principal / unit-context / scope / applicability / constraints / bases and cease/retire
  actions; and a **preserved-dependency banner** shown while no eligible holder kind is admitted,
  explaining that instances are unavailable and why. The create form is only offered when the
  admitted-holder-kind registry is non-empty; the holder-kind selector is populated exclusively from
  that registry, so the UI can never offer an unadmitted holder.

## 2. Preserved boundaries (all honoured)

| Boundary (control) | How preserved |
|---|---|
| **Do not admit any eligible holder kind** | The service only READS `authority_eligible_holder_kinds`; no code path writes to it. Registry remains empty (0). |
| **No Person/Actor/universal-holder architecture** | None created. Holder is an opaque `(id, kind)` reference; eligibility is data-governed by the registry, not by any new subject architecture. |
| **Do not create actual Authority instances to demonstrate** | Zero Authority rows created. The one read-only insert attempt (org holder) was **rejected by the DB guard** (P0001) and persisted nothing. |
| **Do not alter Platform Authorisation** | No auth path references any Authority table; RLS deny-anon on all four tables; admin-only management. Authority grants zero platform permissions. |
| **Do not begin ORG-005** | Not begun. |

The preserved holder dependency is enforced at every layer: the DB guard (`enforce_authority_holder_eligibility`) is the hard enforcement; the service surfaces its rejection without bypass; the UI cannot offer an unadmitted holder. This mirrors the BP-04 office-holding preservation exactly.

## 3. Gate evidence

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **PASS** (0) |
| Full suite | `npm test` | **PASS - 257/257** (255 prior + 2 new FR-013 determination tests) |
| Lint (new/changed) | `npx eslint <bp05 + authorities + 6 routes + page>` | **PASS** (0) |
| Production build | `npm run build` | **PASS** - compiled; all six authority routes registered |

New tests cover the FR-013 composition: empowered only when current + in-scope + all constraints satisfied; a future/out-of-scope/failed-constraint case yields not_empowered; scope-unknown or an indeterminate constraint yields indeterminate (insufficient info is never a failure).

## 4. Read-only production sanity (post-build)

Verified via the service-role read path (no writes):

```
organisations:                      84
organisation_subjects:              84
authority_eligible_holder_kinds:     0   (no eligible holder kind admitted - dependency preserved)
organisation_authorities:            0
organisation_authority_constraints:  0
organisation_authority_bases:        0
```

Boundary proof at the application layer: an attempted Authority insert with an `organisation` holder was **rejected** with `P0001 - organisational authority instances are unavailable: holder subject kind organisation is not an admitted eligible holder (... R07 FR-002 / BE-01)`, and the authorities count remained **0**. No data persisted. The 84-organisation baseline and all BP-01..BP-04 objects are untouched; all Organisation UUIDs and downstream references preserved.

## 5. FR coverage at completion

FA-A (001-008) + FA-C (015-017) + FA-D persistence (018,021) are delivered by migrations 161-162
(applied). FA-B (009-014) and FA-D interpretation (019,020,022) are the deterministic service/pure
cores now implemented and tested. **FR-001/FR-002 remain Preserved:** the mechanism is fully
established and additively ready, but no Authority instance is admissible until an eligible holder
kind is admitted under a governing eligibility architecture - which BP-05 deliberately does not
introduce.

## 6. Git / deployment state

- Branch `org-004-bp03`. Phase B files (`lib/organisations/bp05.ts` [+determination], `bp05.test.ts`,
  `lib/organisations/authorities.ts`, six API routes, `app/organisations/[id]/page.tsx` Authorities
  tab) committed. Migrations 161-162 already applied in production by control.
- **Not pushed, not merged, not deployed.** No production data modified.

## 7. Determination

**BP-05 (Organisational Authority) COMPLETE - READY FOR FINAL CONTROL REVIEW.** No eligible holder
kind admitted; no Person/Actor/universal-holder architecture; no Authority instances created; Platform
Authorisation untouched; ORG-005 not begun.
