// ── Stage 3 — FedEx Benchmark 001 SHADOW ASSESSMENT REPORT (manual runner) ────
// Prints the human-readable shadow assessment + proposed hierarchy for the FedEx
// candidate Findings. Deterministic, no live AI, no production writes. NOT a
// *.test.ts (CI ignores it).
//   npx tsx lib/core/assessment/fedex-shadow-report.ts
import { fedexCandidates, FEDEX_CONTEXT } from "./fedex-fixture";
import { assessFindings, groupByPriority } from "./assess";
import type { Priority } from "./types";

const findings = fedexCandidates();
const assessments = assessFindings(findings, FEDEX_CONTEXT);
const byId = new Map(assessments.map((a) => [a.findingId, a]));

console.log("\n=== FedEx Benchmark 001 — Stage 3 SHADOW ASSESSMENT ===\n");
for (const f of findings) {
  const a = byId.get(f.id)!;
  console.log(`[${f.id}] ${a.concept}`);
  console.log(`   eligibility : ${a.eligibility.level}${a.eligibility.governanceIssueIds.length ? " (" + a.eligibility.governanceIssueIds.join(",") + ")" : ""}`);
  if (a.eligibility.caveats.length) console.log(`      caveats  : ${a.eligibility.caveats.join(" | ")}`);
  console.log(`   confidence  : ${a.confidence.level}  [${a.confidence.reasons.join("; ")}]${a.confidence.constraints.length ? "  constraints: " + a.confidence.constraints.join("; ") : ""}`);
  console.log(`   materiality : ${a.materiality.level}  [${a.materiality.reasons.join("; ")}]`);
  console.log(`   relevance   : ${a.relevance.level}  [${a.relevance.reasons.join("; ")}]`);
  console.log(`   redundancy  : ${a.redundancy.subsumedBy ? "subsumed by " + a.redundancy.subsumedBy : "none"}`);
  console.log(`   PRIORITY    : ${a.priority.toUpperCase()}  — ${a.priorityReasons.join("; ")}`);
  if (a.modelAssisted.length) console.log(`   model/human : ${a.modelAssisted.join(" | ")}`);
  console.log("");
}

const grouped = groupByPriority(findings, assessments);
console.log("=== PROPOSED HIERARCHY ===");
for (const cls of ["primary", "secondary", "contextual", "suppressed"] as Priority[]) {
  console.log(`\n${cls.toUpperCase()}`);
  grouped[cls].forEach((a, i) => console.log(`  ${i + 1}. [${a.findingId}] ${a.concept.slice(0, 90)}${a.concept.length > 90 ? "…" : ""}`));
}
console.log("\n(shadow-only — no production output changed)\n");
