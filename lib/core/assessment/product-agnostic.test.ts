// Stage 3 — the assessment engine is NOT survey-only. Exercises social,
// document, qualitative and campaign evidence. Deterministic, no live AI.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Finding } from "../findings/types";
import type { Evidence } from "../evidence/types";
import type { ContributionKind } from "../vocabulary";
import { assessEligibility } from "./eligibility";
import { assessConfidence } from "./confidence";

const V = { standardVersion: "1.1", coreVersion: "0.1.0", runProvenance: null };
function ev(id: string, contribution: ContributionKind, sourceType: "survey" | "conversation" | "document", base?: number): Evidence {
  return { id, kind: "base", contribution, sourceType, sourceId: "s", ...(base ? { numerator: Math.round(base / 2), denominator: base } : {}) };
}
const mk = (o: Partial<Finding> & { statement: string; evidence: Evidence[] }): Finding => ({ id: "f", version: V, status: "candidate", ...o } as Finding);

test("social listening: a volume 'rose' claim is governed by change state, not survey assumptions", () => {
  const f = mk({ statement: "Conversation volume rose 40%.", assertionType: "temporal", evidence: [ev("e1", "unprompted_discourse", "conversation")] });
  assert.equal(assessEligibility(f).level, "ineligible"); // no governed change state
  assert.notEqual(assessEligibility(f, { governance: { changeState: "comparable_change" } }).level, "ineligible");
});

test("social listening: a plain sentiment-share claim is assessable", () => {
  const f = mk({ statement: "Positive sentiment leads the conversation.", assertionType: "descriptive", evidence: [ev("e1", "unprompted_discourse", "conversation", 800)] });
  assert.equal(assessEligibility(f).level, "eligible");
});

test("documents: an interested_claim source supports 'the document says X', not automatic high confidence", () => {
  const f = mk({ statement: "The report states awareness is high.", assertionType: "descriptive", evidence: [ev("e1", "interested_claim", "document")] });
  assert.equal(assessEligibility(f).level, "eligible");
  // No base and a single interested_claim line → confidence is not 'high'.
  assert.notEqual(assessConfidence(f).level, "high");
});

test("qualitative: a repeated theme is assessable and not treated as quantitative prevalence", () => {
  const f = mk({ statement: "Several participants mentioned access to experiences.", assertionType: "descriptive", evidence: [ev("e1", "unprompted_discourse", "conversation")] });
  assert.equal(assessEligibility(f).level, "eligible");
});

test("campaign/behavioural: causal attribution of observed movement is blocked without causal evidence", () => {
  const f = mk({ statement: "The activation caused click-through to rise.", assertionType: "causal", evidence: [ev("e1", "documented_activity", "conversation")] });
  assert.equal(assessEligibility(f).level, "ineligible"); // causal on one kind, no causal support
});

test("campaign/behavioural: observed movement WITH governed causal support is not auto-blocked", () => {
  const f = mk({ statement: "Click-through moved after the change.", assertionType: "descriptive", evidence: [ev("e1", "documented_activity", "conversation", 5000)] });
  assert.equal(assessEligibility(f).level, "eligible");
});
