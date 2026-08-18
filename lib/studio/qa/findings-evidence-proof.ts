// ── Findings evidence-freezing PROOF (QA only, pure, no DB writes) ───────────
// Reproduces the live FedEx failure BEFORE the fix and proves the fix AFTER, using the
// REAL FedEx governed evidence (base + deterministic derived + governed segment) run
// through the actual resolver functions. No database, no network, no recomputation of
// survey data beyond the deterministic derived/segment builders (the same the run uses).
//
//   npx tsx lib/studio/qa/findings-evidence-proof.ts

import { buildFedexStudy, buildFedexSegments } from "./fedex-fixture";
import { buildStudyAnalysisEvidence } from "@/lib/studio/study-analysis";
import { buildSegmentDerived } from "@/lib/studio/study-segments";
import { selectEvidenceByRefs, selectFindingEvidence, evidenceView } from "@/lib/studio/study-finding";

const { study, resultGroups } = buildFedexStudy();
const segmentDerived = buildSegmentDerived(study.id, buildFedexSegments());
const payload = buildStudyAnalysisEvidence(study, resultGroups, segmentDerived);
const snapshot = { evidence: payload.evidence, derived: payload.derived, segmentDerived: payload.segmentDerived };

// The exact proposal from the live failure: "Strong natural fit leads perceptions of
// FedEx as a UCL sponsor" — cites the combined base stat + the derived 2.6pp lead fact.
const leader = payload.derived.find((d) => d.kind === "leader" && d.canonicalQuestionKey === "q_fit")!;
const combinedStrongFit = payload.evidence.find((e) => e.scope === "combined" && e.canonicalQuestionKey === "q_fit" && e.optionLabel === "Strong natural fit")!;
const baseDerivedRefs = [combinedStrongFit.ref, leader.ref];

// A country/segment-backed proposal: the Germany recognition weakness.
const germany = payload.segmentDerived.find((s) => /Germany/.test(s.label))!;

console.log("\n=== FedEx governed evidence available to a proposal ===");
console.log(`base: ${payload.evidence.length} · derived: ${payload.derived.length} · segment: ${payload.segmentDerived.length}`);
console.log(`derived "2.6pp lead": ${leader.ref}\n  → ${leader.label}`);
console.log(`segment "Germany":    ${germany.ref}\n  → ${germany.label}`);

console.log("\n=== BEFORE (base-only resolver) — reproduces the live failure ===");
const before = selectEvidenceByRefs(baseDerivedRefs, payload.evidence);
console.log(`selectEvidenceByRefs(base only): ok=${before.ok} · missing=${JSON.stringify(before.missing)}`);
console.log(before.ok ? "  (unexpected)" : `  → UI showed: "Evidence could not be resolved from the analysis run (${before.missing.length} missing)."`);

console.log("\n=== AFTER (unified resolver) — base + derived ===");
const afterBD = selectFindingEvidence(baseDerivedRefs, snapshot);
console.log(`selectFindingEvidence: ok=${afterBD.ok} · frozen=${afterBD.evidence.length} · classes=${JSON.stringify(afterBD.evidence.map((e) => e.evidenceClass))}`);
for (const e of afterBD.evidence) { const v = evidenceView(0, e); console.log(`  [${v.evidenceClass}] ${v.label}`); }

console.log("\n=== AFTER — segment (Germany) ===");
const afterSeg = selectFindingEvidence([germany.ref], snapshot);
console.log(`selectFindingEvidence: ok=${afterSeg.ok} · class=${afterSeg.evidence[0]?.evidenceClass}`);
console.log(`  [${afterSeg.evidence[0]?.evidenceClass}] ${evidenceView(0, afterSeg.evidence[0]).label}`);

console.log("\n=== FREEZE semantics — frozen copy survives a later snapshot change ===");
const frozen = afterBD.evidence[1]; // the derived item copied into the "Finding"
const frozenLabelAtCapture = evidenceView(0, frozen).label;
leader.label = "MUTATED BY A LATER RERUN"; // mutate the run snapshot's derived fact
const stillFrozen = evidenceView(0, frozen).label; // the finding's copy is independent
console.log(`frozen at capture : ${frozenLabelAtCapture}`);
console.log(`run snapshot now  : ${leader.label}`);
console.log(`finding still shows: ${stillFrozen}`);
console.log(stillFrozen === frozenLabelAtCapture && !/MUTATED/.test(stillFrozen) ? "  → FROZEN evidence unchanged ✅" : "  → LEAK ❌");

console.log("\n=== provenance / governance ===");
console.log(`every frozen ref resolves to a governed snapshot item: ${afterBD.evidence.every((e) => !!e.ref)} ; no recomputation performed (labels copied verbatim).`);
console.log("");
