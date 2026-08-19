import { test } from "node:test";
import assert from "node:assert/strict";
import type { Finding } from "./types";
import type { Evidence, Result } from "../evidence/types";
import { proportion, percentagePoints } from "../evidence/scale";
import { STANDARD_VERSION, CORE_VERSION } from "../version";

test("Evidence → Result → Finding constructs, and the chain may stop at Finding", () => {
  const evidence: Evidence = {
    id: "e1", kind: "base", sourceType: "survey", sourceId: "s1",
    question: { canonicalKey: "q_fit" }, option: { id: "strong_fit", label: "Strong natural fit" },
    numerator: 92, denominator: 274, denominatorType: "respondents",
    quantity: proportion(92 / 274), // explicit scale — a proportion, not "33.6"
  };
  const result: Result = {
    id: "r1", operation: "share", quantity: proportion(92 / 274),
    numerator: 92, denominator: 274, components: ["e1"], policyVersion: "1",
  };
  const finding: Finding = {
    id: "f1", statement: "A third describe FedEx as a strong natural fit.",
    evidence: [evidence], results: [result], source: { surveyId: "s1" }, questions: ["q_fit"],
    version: { standardVersion: STANDARD_VERSION, coreVersion: CORE_VERSION, runProvenance: null },
    status: "candidate",
  };
  assert.equal(finding.evidence[0].quantity?.unit, "proportion");
  assert.equal(finding.evidence[0].quantity?.value, 92 / 274);
  // The chain stopped at Finding: interpretive stages are absent, not fabricated.
  assert.equal(finding.insight, undefined);
  assert.equal(finding.implications, undefined);
  assert.equal(finding.recommendations, undefined);
  assert.equal(finding.confidence, undefined);
  assert.equal(finding.materiality, undefined);
});

test("a governed grouping Result carries explicit scale and component provenance", () => {
  const grouping: Result = {
    id: "r2", operation: "grouping", quantity: percentagePoints(64.6), // 0–100 scale, explicit
    components: ["e1", "e2"],
    grouping: { kind: "governed_semantic", componentLabels: ["Strong natural fit", "Relevant but unclear"], parentConstruct: "perceives at least some relevance" },
  };
  assert.equal(grouping.quantity.unit, "percentage_points");
  assert.equal(grouping.quantity.value, 64.6);
  // Type system note: grouping.kind cannot be "thematic_synthesis" (ResultGroupingKind),
  // so a thematic synthesis can never be represented as a numeric Result.
  assert.equal(grouping.grouping?.kind, "governed_semantic");
  assert.equal(grouping.components?.length, 2);
});
