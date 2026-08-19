// ── Fanometrix Analytical Core — eligibility (Stage 3, deterministic) ─────────
// Can this Finding compete for prominence? Driven by the governance registry
// (Stage 2/2.1). A BLOCKING governance violation → ineligible (never merely "low
// confidence"). Advisory issues + evidence limits → eligible_with_caveat. A
// missing structured evidence state the Core cannot honestly decide →
// unable_to_assess. This preserves the hierarchy: governance-invalid ≠ low-priority.

import type { Finding } from "../findings/types";
import type { AnalysisContext, EligibilityAssessment } from "./types";
import { validateFinding } from "../governance/validators";
import { worstBaseState } from "./signals";
import { constructAuthorityOf } from "../semantic/interpretation";

export function assessEligibility(f: Finding, ctx: AnalysisContext = {}): EligibilityAssessment {
  const reasons: string[] = [];
  const caveats: string[] = [];

  if (!f.statement?.trim() || f.evidence.length === 0) {
    return { level: "unable_to_assess", reasons: ["no statement or no evidence to assess"], caveats: [], governanceIssueIds: [], assessor: "deterministic" };
  }

  const issues = validateFinding(f, ctx.governance ?? {});
  const blocking = issues.filter((i) => i.blocking);
  const advisory = issues.filter((i) => !i.blocking);
  const governanceIssueIds = [...new Set(blocking.map((i) => i.ruleId))];

  if (blocking.length) {
    return {
      level: "ineligible",
      reasons: [`blocking governance violation(s): ${governanceIssueIds.join(", ")}`],
      caveats: [],
      governanceIssueIds,
      assessor: "deterministic",
    };
  }

  // Evidence-limitation caveats (do not make advisory issues ineligible).
  for (const a of new Set(advisory.map((i) => i.ruleId))) caveats.push(`advisory governance concern: ${a}`);
  const base = worstBaseState(f);
  if (base === "suppressed") caveats.push("base below the reportable minimum for inference");
  else if (base === "directional") caveats.push("directional base — treat any pattern cautiously");
  // A comparative claim with no statistical assessment where one would have helped.
  if (f.assertionType === "comparative" && !f.statisticalAssessment) caveats.push("no statistical assessment available for a comparative claim");
  // Semantic groupings the deterministic layer cannot fully verify — UNLESS the
  // interpretation carries independently-established authority (DERIVED/DECLARED/
  // ATTESTED), where deterministic derivation already establishes validity and no
  // model/human review is required (Stage 5R.4 §25). PROVISIONAL keeps the caveat.
  const groupingResults = (f.results ?? []).filter((r) => !!r.grouping);
  const authority = constructAuthorityOf(f);
  const independentlyAuthoritative = authority === "derived" || authority === "declared" || authority === "attested";
  if (groupingResults.length && !independentlyAuthoritative) {
    caveats.push("semantic grouping validity requires model/human review");
  }
  // Construct-authority caveat (Stage 5R.1, Standard v1.2 §44): a NOVEL construct
  // whose authority rests only on model judgement is PROVISIONAL. It stays
  // eligible (useful exploratory intelligence) but the ranking ceiling holds it
  // below headline priority. Read from STRUCTURED authority metadata — never
  // inferred from construct-label wording (the "unverified" string coupling that
  // the Stage 5 leak erased on approval is deliberately gone).
  if (authority === "provisional") {
    caveats.push("novel construct authority is provisional — pending independent validation");
  }

  if (caveats.length) {
    reasons.push("permitted, with evidence limitations");
    return { level: "eligible_with_caveat", reasons, caveats, governanceIssueIds: [], assessor: "deterministic" };
  }
  reasons.push("no blocking governance issue; evidence adequate");
  return { level: "eligible", reasons, caveats: [], governanceIssueIds: [], assessor: "deterministic" };
}
