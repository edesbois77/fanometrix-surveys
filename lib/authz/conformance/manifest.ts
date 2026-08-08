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

  // ── IW-4 delivered: composition engine & source-attributed provenance (HELD) ──
  { ref: "Q-20/Q-21-compose", cls: "HELD", description: "Explicit source composition (direct/Role/policy/resource → ALLOW/DENY/NO_EFFECT) by the canonical Q-22 rule: no inherent source priority, explicit DENY precedence, Default Refuse; source-attributed provenance retains EVERY independently-applicable ALLOW source (Q-35-D06/D07). Admin super-ALLOW retained (IW-5). SG-4 (DENY-precedence half).", evidence: ["lib/authz/composition.test.ts", "lib/authz/decision.test.ts"] },
  { ref: "F033", cls: "HELD", description: "Restricted-insight access uses a governed org-ID policy input when present (id-anchored, collision-free), replacing the org-NAME string match (F033/G5); legacy name-match retained as strangler fallback until migration 167 backfills allowed_organisation_ids (id-activation gated on that migration + collision review).", evidence: ["lib/insights-access.test.ts"] },

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
  // ── IW-5 delivered: no super-ALLOW + scoped admin authority + Exceptional Access (HELD) ──
  { ref: "Q-22-no-super-ALLOW", cls: "HELD", description: "SG-4 completion: admin super-ALLOW REMOVED from the seam (F011/F023) — explicit DENY precedence + resource authorisation apply to admin like everyone; scoped admin authority and Exceptional Access are ordinary ALLOWs with no priority over DENY. Live cut-over (lib/access.ts) is the seam→enforce step.", evidence: ["lib/authz/decision.test.ts", "lib/authz/composition.test.ts", "lib/authz/conformance/invariants.test.ts"] },
  { ref: "Q-19", cls: "HELD", description: "Exceptional Resource Access (SG-5): a distinct, bounded, purposeful, time-boxed, audited path (IW-7) — same principal, explicit eligibility + invocation, bounded resource/scope+operation, expiry; not an override-DENY; establishes no durable context.", evidence: ["lib/authz/exceptional-access.test.ts"] },
  { ref: "Q-06-enforce", cls: "HELD", description: "Active Organisation Context authoritative in requireUser (read cut-over); scalar organisation_id retained as fallback until IW-11.", evidence: ["lib/authz/conformance/invariants.test.ts"] },
  // ── IW-2 delivered: Contextual Roles as Permission Profiles mechanism (HELD) ──
  { ref: "Q-11", cls: "HELD", description: "Role = permission profile bound to a User–Organisation Access (contextual, no carry-over); orthogonal to Organisation classification. Contextual value authoritative with legacy users.role as strangler fallback; scalar decommission deferred.", evidence: ["lib/authz/role-profile.test.ts", "lib/authz/conformance/invariants.test.ts"] },
  // ── IW-3 delivered: Product Access & Product Capability Access mechanism (HELD) ──
  { ref: "Q-09/Q-10-mech", cls: "HELD", description: "Product Access (role-derived) and Product Capability Access (direct) modelled as DISTINCT server-side layers; capability independent of product access; nav never an authorisation input (SG-3); exhaustive parity with the legacy gate; admin super-ALLOW retained (IW-5).", evidence: ["lib/authz/product-access.test.ts", "lib/authz/conformance/invariants.test.ts"] },
  { ref: "Q-09/Q-10-enforce", cls: "HELD", description: "Enforce cut-over: Product Access authoritative via the governed model at the requireUser seam (legacy allowedRoles fallback retained); Product Capability Access authoritative via hasCapability at all 9 sites; middleware model-driven + projection-only (SG-3). Behaviour unchanged (exhaustive parity).", evidence: ["lib/authz/conformance/invariants.test.ts", "lib/authz/product-access.test.ts"] },
  { ref: "Q-14/Q-15", cls: "TARGET", description: "Organisation Resource Entitlement vs User Resource Authorisation.", closesAt: "IW-6", evidence: ["lib/authz/conformance/invariants.test.ts"] },
  { ref: "Q-27", cls: "HELD", description: "Scoped Platform Administration Authority (SG-5): bounded operation/scope; administer≠possess (never resource content access); no self-elevation; internal status confers nothing. Structural model; concrete privileged catalogue + admin mechanics are §38-reserved. Persistence + live cut-over are a gated activation.", evidence: ["lib/authz/admin-authority.test.ts", "lib/authz/conformance/invariants.test.ts"] },
  // ── IW-7 delivered: security-audit capability & mandatory-audit fail-closed (HELD) ──
  { ref: "Q-29/Q-30-mech", cls: "HELD", description: "Security audit CAPABILITY: durable, attributable, TAMPER-EVIDENT (hash chain + append-only), access-protected, content-MINIMISED (no content/secrets); mandatory-audit FAIL-CLOSED primitive (SG-7); permission never read from audit (F048 retained). Store = migration 168 (presented).", evidence: ["lib/authz/audit.test.ts"] },
  { ref: "Q-29-activate", cls: "HELD", description: "Audit subsystem LIVE (migration 168 applied): recordSecurityEvent recording live; mandatory authz-change events wired (user create/update/status/grants, org lifecycle) with SG-7 fail-closed (withMandatoryAudit) — a live audit-write failure refuses the operation; tamper-evidence (append-only + chain), G9 read-after-write and access-protection verified in production.", evidence: ["lib/authz/conformance/invariants.test.ts", "lib/authz/audit.test.ts"] },
  // ── IW-8 delivered: explainability & operational diagnosis (HELD) ─────────────
  // ── IW-8 delivered: explainability & operational diagnosis (HELD) ─────────────
  { ref: "Q-35", cls: "HELD", description: "Audience-separated explanation (User coarse/existence-safe → admin sources+DENY/Default → security/operator +INDETERMINATE class), faithfully derived from provenance (D22), least-disclosure (D23/D24); explanation is NOT an authority source (D01) and imports no live state (F069 retained — caller gates the audience). Existence-leak CLOSED: read-detail handlers return uniform 404 for undiscoverable resources (F068/D10, SG-3/SG-9).", evidence: ["lib/authz/explanation.test.ts", "lib/authz/conformance/invariants.test.ts"] },
  // ── IW-9 delivered: session/token currency mechanism (HELD) ──────────────────
  { ref: "F058-mech", cls: "HELD", description: "Session/token revocation mechanism (Q-31/Q-33, F058/F059): a per-user token-version epoch; a bump revokes earlier-issued sessions (explicit revoke/disable) and invalidates stale sessions on password/forced-change; anti-resurrection (stale never out-votes current, F060); fail-safe (undefined version = current, never a false revocation). Store = migration 169 (presented).", evidence: ["lib/authz/session-currency.test.ts"] },
  { ref: "F058-activate", cls: "TARGET", description: "Session/token revocation LIVE: migration 169 applied; JWT carries tv; requireUser enforces version currency (SG-8); bump wired at password-change/forced-change/disable; verified in production.", closesAt: "IW-9-activation", evidence: ["lib/authz/conformance/invariants.test.ts"] },
];

export function manifestSummary() {
  const by = (c: ItemClass) => CONFORMANCE_MANIFEST.filter(i => i.cls === c).length;
  return { total: CONFORMANCE_MANIFEST.length, HELD: by("HELD"), TARGET: by("TARGET"), REGRESSION: by("REGRESSION") };
}
