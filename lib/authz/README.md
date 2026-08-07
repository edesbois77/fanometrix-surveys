# `lib/authz` — ORG-005 Authorisation Decision Seam (IW-0)

Governed under the frozen **ORG-005 Implementation Programme Plan v1.0**, workstream **IW-0 — Conformance Harness & Decision Seam**. This is the foundation only; later workstreams (IW-1…IW-11) are **not** authorised by IW-0 and must not be implemented through this module.

## What IW-0 delivers
- **`decision.ts`** — a single, pure, central authorisation **decision seam** (`evaluate()`) that re-expresses the *current* authorised production semantics (`lib/auth-server.ts` `requireUser` + `lib/access.ts` + per-handler guards) in one governed vocabulary, and adds:
  - an explicit **ALLOW / REFUSE / INDETERMINATE** distinction (mechanism for UD-01 **F064**), and
  - recoverable decision **provenance** (mechanism for **F022 / F066**).
- **Shadow→enforce mechanism** — `compareToLegacy()` / `effectiveAllow(mode)`: the no-authorisation-gap migration primitive. Ships **inert** — no request handler calls it at IW-0.
- **`conformance/`** — the governed harness: `manifest.ts` indexes every asserted property (HELD / TARGET / REGRESSION); `*.test.ts` assert them; runs under the project's `npm test`.

## Boundaries (IW-0)
The seam **mirrors current behaviour and changes nothing**. In particular it **preserves** the admin super-ALLOW (a governed CONFLICT, **F011**, replaced at **IW-5**) and is **not wired into any route**. It does not implement: the Organisation model / Active Context (IW-1), contextual roles (IW-2), Product/Capability (IW-3), Resource Entitlement (IW-6), scoped admin / Exceptional Resource Access (IW-5), audit (IW-7), or explainability (IW-8).

## Conformance classes
- **HELD** — holds today and must never regress (the 14 UD-01 RETAIN properties + currently-true invariants).
- **TARGET** — an approved-architecture invariant the current code violates; a `todo` assertion closed by its owning workstream (keeps CI green while recording the debt).
- **REGRESSION** — remediated-vulnerability floor that must stay green: Reporting API fail-open (`lib/reporting-auth.test.ts`), F040 (`lib/campaign-project-association.test.ts`), F041 (`lib/library-documents/governance.test.ts`).

## Adoption (later workstreams, not now)
Each later workstream resolves its inputs with the existing resolvers, calls `evaluate()`, runs it in **shadow** (`compareToLegacy`, legacy authoritative) until divergence is understood, then flips that route to **enforce**. Legacy paths remain the fallback until the final decommission workstream (IW-11).
