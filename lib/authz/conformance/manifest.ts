// ORG-005 · IW-0 — Governed Conformance Harness Manifest.
//
// The single governed index of what the ORG-005 conformance harness asserts.
// Every ORG-005 implementation workstream deploys only when the harness is
// green for its gate. Three classes of item:
//   • HELD       — a property that holds in the CURRENT implementation and must
//                  never regress (the UD-01 RETAIN set + currently-true
//                  invariants). Backed by a passing test.
//   • TARGET     — an approved architecture invariant that the current
//                  implementation VIOLATES (a UD-01 CONFLICT / NOT-IMPLEMENTED);
//                  encoded as a `todo` assertion and closed by its owning
//                  workstream. Documents conformance debt without failing CI.
//   • REGRESSION — a remediated-vulnerability floor that must stay green
//                  (Reporting API fail-open; F040/F041 cross-org).
//
// Paths are repo-relative; manifest.test.ts asserts every `evidence` file
// exists (harness integrity).

export type ItemClass = "HELD" | "TARGET" | "REGRESSION";

export interface ConformanceItem {
  ref: string;              // Q-decision or F-number
  cls: ItemClass;
  description: string;
  closesAt?: string;        // owning workstream for a TARGET
  evidence: string[];       // test file(s), repo-relative
}

export const CONFORMANCE_MANIFEST: ConformanceItem[] = [
  // ── Decision seam: currently-true invariants delivered / preserved at IW-0 ──
  { ref: "Q-22", cls: "HELD", description: "Default Refuse — absence of a sufficient ALLOW yields REFUSE.", evidence: ["lib/authz/decision.test.ts"] },
  { ref: "Q-34", cls: "HELD", description: "REFUSE vs INDETERMINATE distinguished; INDETERMINATE never ALLOWs (fail-closed).", evidence: ["lib/authz/decision.test.ts"] },
  { ref: "Q-22-deny", cls: "HELD", description: "Explicit DENY precedence over an otherwise-ALLOW (non-admin).", evidence: ["lib/authz/decision.test.ts"] },
  { ref: "Q-21", cls: "HELD", description: "Decision provenance is recoverable (source attribution).", evidence: ["lib/authz/decision.test.ts"] },

  // ── UD-01 RETAIN properties (must never regress) ──
  { ref: "F001", cls: "HELD", description: "Identity-only token; seam holds no state and reads no authority from a token.", evidence: ["lib/authz/conformance/retain-properties.test.ts"] },
  { ref: "F003", cls: "HELD", description: "Live-authority: seam consumes freshly-resolved inputs, caches nothing.", evidence: ["lib/authz/conformance/retain-properties.test.ts"] },
  { ref: "F011-limit", cls: "HELD", description: "Admin does NOT bypass the inactive-principal block.", evidence: ["lib/authz/decision.test.ts"] },
  { ref: "F017", cls: "HELD", description: "App-layer authoritative model (RLS not mandated) — seam is the enforcement locus.", evidence: ["lib/authz/conformance/retain-properties.test.ts"] },
  { ref: "F063", cls: "HELD", description: "Fail-closed: no fail-open / last-known-good; INDETERMINATE denies.", evidence: ["lib/authz/decision.test.ts", "lib/authz/conformance/retain-properties.test.ts"] },
  { ref: "F065", cls: "HELD", description: "Failure manufactures no state; evaluate() is pure/deterministic.", evidence: ["lib/authz/decision.test.ts", "lib/authz/conformance/retain-properties.test.ts"] },
  { ref: "F057", cls: "HELD", description: "Revocation immediate + dependency-scoped (inputs re-resolved each call).", evidence: ["lib/authz/conformance/retain-properties.test.ts"] },
  { ref: "F060", cls: "HELD", description: "Anti-resurrection: no stale projection is an authority source.", evidence: ["lib/authz/conformance/retain-properties.test.ts"] },
  { ref: "F034", cls: "HELD", description: "Organisation Relationship/Classification never an access source.", evidence: ["lib/authz/conformance/retain-properties.test.ts"] },
  { ref: "F048", cls: "HELD", description: "Permission never reconstructed from audit history.", evidence: ["lib/authz/conformance/retain-properties.test.ts"] },
  { ref: "F049", cls: "HELD", description: "Minimisation: seam introduces no domain-data duplication.", evidence: ["lib/authz/conformance/retain-properties.test.ts"] },
  { ref: "F069", cls: "HELD", description: "Diagnostic access protected (no unrestricted permission-explain surface).", evidence: ["lib/authz/conformance/retain-properties.test.ts"] },

  // ── Remediated-vulnerability regression floor ──
  { ref: "F005-reporting", cls: "REGRESSION", description: "Reporting API fails closed when key absent/empty/whitespace.", evidence: ["lib/reporting-auth.test.ts"] },
  { ref: "F040", cls: "REGRESSION", description: "Campaign↔project cross-org association refused; org-consistency invariant.", evidence: ["lib/campaign-project-association.test.ts"] },
  { ref: "F041", cls: "REGRESSION", description: "Library document read authorised before record/signed-URL; leaked UUID insufficient.", evidence: ["lib/library-documents/governance.test.ts"] },

  // ── IW-1 delivered: Organisation model & Active Context mechanism (HELD) ──
  { ref: "Q-05", cls: "HELD", description: "User–Organisation Access multiplicity zero/one/many; context handles all.", evidence: ["lib/authz/organisation-access.test.ts", "lib/authz/conformance/invariants.test.ts"] },
  { ref: "Q-06-mech", cls: "HELD", description: "Exactly one Active Organisation Context; never a permission union.", evidence: ["lib/authz/organisation-access.test.ts", "lib/authz/conformance/invariants.test.ts"] },
  { ref: "Q-07", cls: "HELD", description: "Remembered/preferred context honoured only while still authorised.", evidence: ["lib/authz/organisation-access.test.ts", "lib/authz/conformance/invariants.test.ts"] },
  { ref: "Q-08", cls: "HELD", description: "Switch only among authorised orgs; unauthorised switch grants no context (no carry-over).", evidence: ["lib/authz/organisation-access.test.ts", "lib/authz/conformance/invariants.test.ts"] },

  // ── TARGET invariants — current implementation violates; closed by owner WS ──
  { ref: "Q-22-no-super-ALLOW", cls: "TARGET", description: "No super-ALLOW: admin must not unconditionally bypass resource/DENY.", closesAt: "IW-5", evidence: ["lib/authz/conformance/invariants.test.ts"] },
  { ref: "Q-06-enforce", cls: "HELD", description: "Active Organisation Context authoritative in requireUser (read cut-over); scalar organisation_id retained as fallback until IW-11.", evidence: ["lib/authz/conformance/invariants.test.ts"] },
  // ── IW-2 delivered: Contextual Roles as Permission Profiles mechanism (HELD) ──
  { ref: "Q-11", cls: "HELD", description: "Role = permission profile bound to a User–Organisation Access (contextual, no carry-over); orthogonal to Organisation classification. Contextual value authoritative with legacy users.role as strangler fallback; scalar decommission deferred.", evidence: ["lib/authz/role-profile.test.ts", "lib/authz/conformance/invariants.test.ts"] },
  // ── IW-3 delivered: Product Access & Product Capability Access mechanism (HELD) ──
  { ref: "Q-09/Q-10-mech", cls: "HELD", description: "Product Access (role-derived) and Product Capability Access (direct) modelled as DISTINCT server-side layers; capability independent of product access; nav never an authorisation input (SG-3); exhaustive parity with the legacy gate; admin super-ALLOW retained (IW-5).", evidence: ["lib/authz/product-access.test.ts", "lib/authz/conformance/invariants.test.ts"] },
  { ref: "Q-09/Q-10-enforce", cls: "TARGET", description: "Product/Capability decisions authoritative at the seam (enforce cut-over); nav projection-only across all product areas. Runs in shadow first (Programme §4).", closesAt: "IW-3-enforce", evidence: ["lib/authz/conformance/invariants.test.ts"] },
  { ref: "Q-14/Q-15", cls: "TARGET", description: "Organisation Resource Entitlement vs User Resource Authorisation.", closesAt: "IW-6", evidence: ["lib/authz/conformance/invariants.test.ts"] },
  { ref: "Q-27", cls: "TARGET", description: "Scoped Platform Administration Authority; administer≠possess; no self-elevation.", closesAt: "IW-5", evidence: ["lib/authz/conformance/invariants.test.ts"] },
  { ref: "Q-29", cls: "TARGET", description: "Security audit of authorisation changes / privileged & Data access; mandatory-audit fail-closed.", closesAt: "IW-7", evidence: ["lib/authz/conformance/invariants.test.ts"] },
  { ref: "Q-35", cls: "TARGET", description: "Audience-separated explanation; denial causes distinct; no existence leak.", closesAt: "IW-8", evidence: ["lib/authz/conformance/invariants.test.ts"] },
  { ref: "F058", cls: "TARGET", description: "Session/token revocation before expiry.", closesAt: "IW-9", evidence: ["lib/authz/conformance/invariants.test.ts"] },
];

export function manifestSummary() {
  const by = (c: ItemClass) => CONFORMANCE_MANIFEST.filter(i => i.cls === c).length;
  return { total: CONFORMANCE_MANIFEST.length, HELD: by("HELD"), TARGET: by("TARGET"), REGRESSION: by("REGRESSION") };
}
