// ── Stage 4 — FedEx DISCOVERY-FROM-SCRATCH report (manual runner) ─────────────
// Runs the Core pipeline on the FedEx governed source (NOT the Gold Findings) and
// prints everything it discovered. Deterministic + fixture semantic judges; no
// live AI, no production writes. Not a *.test.ts.
//   npx tsx lib/core/pipeline/fedex-discovery-report.ts
import { runAnalysis } from "./analyse";
import { fedexDiscoveryInput, fedexPipelineOptions } from "./fedex-discovery";

const { outcomes, hierarchy } = runAnalysis(fedexDiscoveryInput(), fedexPipelineOptions());

console.log("\n=== FedEx Stage 4 — DISCOVERED FROM SOURCE (no Gold candidates supplied) ===\n");
for (const o of outcomes) {
  const a = o.assessment;
  console.log(`[${o.candidate.id}] (${o.candidate.kind}) ${o.candidate.claim}`);
  console.log(`   state: ${o.finalState}${o.priority ? " · priority " + o.priority : ""}${o.candidate.construct ? " · construct: " + o.candidate.construct : ""}`);
  if (o.disconfirmation) console.log(`   disconfirmation: ${o.disconfirmation.status} [${o.disconfirmation.reasons.join("; ")}]`);
  if (a) console.log(`   eligibility ${a.eligibility.level} · confidence ${a.confidence.level} · materiality ${a.materiality.level} · relevance ${a.relevance.level}`);
  console.log(`   reason: ${o.decisionReason}`);
  console.log("");
}

const counts = outcomes.reduce<Record<string, number>>((m, o) => { m[o.finalState] = (m[o.finalState] ?? 0) + 1; return m; }, {});
console.log("=== SUMMARY ===");
console.log(`generated ${outcomes.length} candidates → ` + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", "));

console.log("\n=== FINAL HIERARCHY (from discovered candidates) ===");
for (const cls of ["primary", "secondary", "contextual", "suppressed"] as const) {
  console.log(`\n${cls.toUpperCase()}`);
  hierarchy[cls].forEach((a, i) => console.log(`  ${i + 1}. [${a.findingId}] ${a.concept.slice(0, 88)}${a.concept.length > 88 ? "…" : ""}`));
}
console.log("\n(shadow-only — no production output changed)\n");
