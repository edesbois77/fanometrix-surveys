import { test } from "node:test";
import assert from "node:assert/strict";
import { toRows, temporalValidityFor, ENGINE_AUTHOR } from "./finding-store";
import { assess } from "./candidate";
import { applyChallenge } from "./disconfirmation";
import { frameEvidence, projectFor, type FramedItem } from "./framing";
import { shownFor, type CandidateProposition } from "./formation";
import { deriveConfidence, deriveEvidenceStrength } from "./assessment";
import { MATRIX_VERSION } from "./matrix";
import { ASSERTION_TAXONOMY_VERSION, type ContributionKind } from "./types";
import type { EvidenceRole } from "@/lib/evidence-role";
import type { MethodFit } from "@/lib/information-needs";

// Migration 143. Persistence stores what pure functions decided and decides
// nothing itself: a stored grade must be reproducible by re-deriving it from the
// citations stored beside it, and it cannot be if storage has an opinion.

let seq = 0;
const item = (over: Partial<FramedItem> = {}): FramedItem => {
  seq += 1;
  return {
    evidenceId: `e${seq}`, content: `evidence ${seq}`,
    contribution: "unprompted_discourse" as ContributionKind, role: "direct" as EvidenceRole,
    bearing: 0.85, observationKey: `unit-${seq}`, observations: 1,
    methodFit: "primary" as MethodFit, provenance: "Reddit · UK", ...over,
  };
};
const frameOf = (items: FramedItem[]) => frameEvidence({ needId: "need_1", items });

const need = {
  id: "need_1", need: "How do fans describe it?", aspect: "Brand Perception",
  requirement: "Understand how fans see the sponsorship",
};

function assessed(frame: ReturnType<typeof frameOf>, over: Partial<CandidateProposition> = {}, challenge: Parameters<typeof applyChallenge>[0]["raw"] = { contesting: [], qualifying: [] }) {
  const proposition: CandidateProposition = {
    id: "need_1:p0", needId: "need_1", statement: "Price is what holds this audience back.",
    assertion: "descriptive", scope: "UK fans, 2026", warrant: "Cost is raised unprompted.",
    reading: "price is the barrier", citations: shownFor(frame), rejectedCitations: [], isNull: false, ...over,
  };
  return assess(
    applyChallenge({ proposition, candidates: projectFor(frame, "descriptive").admitted, raw: challenge, ran: true }),
    frame.examined,
  );
}

const rowsFor = (frame: ReturnType<typeof frameOf>, over: Partial<CandidateProposition> = {}, rank = 1) =>
  toRows({
    projectId: "proj-1", need, requirementKey: "req_abc",
    proposition: assessed(frame, over), rank, runId: "run-1", model: "test-model",
  });

// ── The claim and its anchors ────────────────────────────────────────────────

test("a finding is anchored to one requirement and one question", () => {
  const { finding } = rowsFor(frameOf([item(), item()]));
  assert.equal(finding.requirement_key, "req_abc");
  assert.equal(finding.need_id, "need_1");
  assert.equal(finding.need_text, need.need);
  assert.equal(finding.requirement_text, need.requirement);
});

test("a finding carries its scope and its warrant, not just its sentence", () => {
  const { finding } = rowsFor(frameOf([item()]));
  assert.equal(finding.scope, "UK fans, 2026");
  assert.equal(finding.warrant, "Cost is raised unprompted.");
  assert.equal(finding.assertion_type, "descriptive");
});

test("perishability is written at creation, because it cannot be retrofitted", () => {
  assert.equal(temporalValidityFor("descriptive"), "point_in_time");
  assert.equal(temporalValidityFor("temporal"), "periodic");
  assert.equal(temporalValidityFor("causal"), "structural");
  assert.equal(rowsFor(frameOf([item()])).finding.temporal_validity, "point_in_time");
});

// ── Nothing is approved by being written ─────────────────────────────────────

test("everything the engine writes is a candidate, authored by the engine and reviewed by nobody", () => {
  const { finding } = rowsFor(frameOf([item(), item()]));
  assert.equal(finding.status, "candidate");
  assert.equal(finding.authored_by, ENGINE_AUTHOR);
  assert.equal(finding.version, 1);
});

test("every rival is a row, so an analyst can promote one instead of the winner", () => {
  const frame = frameOf([item(), item()]);
  const winner = rowsFor(frame, { id: "p0", reading: "price" }, 1);
  const rival = rowsFor(frame, { id: "p1", reading: "trust, not price" }, 2);

  assert.equal(winner.finding.rank, 1);
  assert.equal(rival.finding.rank, 2);
  assert.equal(rival.finding.status, "candidate", "a rival is adjudicable, not an attachment on the winner");
  assert.notEqual(winner.finding.id, rival.finding.id);
});

// ── A stored grade must be reproducible from what is stored beside it ────────

test("re-deriving confidence from the stored citations gives the stored grade", () => {
  // The property that makes storing a derived value safe. If this ever fails,
  // storage has started having opinions.
  const frame = frameOf([item(), item(), item()]);
  const { finding, evidence } = rowsFor(frame);

  const rebuilt = evidence.filter(e => !e.rejected).map(e => ({
    stance: e.stance as "establishes",
    admissibility: e.admissibility as "admissible",
    contribution: e.contribution_kind as ContributionKind,
    observationKey: e.observation_key,
    observations: e.observations,
    weight: e.bearing,
  }));

  const confidence = deriveConfidence({ citations: rebuilt, assertion: "descriptive", disconfirmed: finding.disconfirmed, examined: 3 });
  const strength = deriveEvidenceStrength(rebuilt);

  assert.equal(confidence.level, finding.confidence_level);
  assert.equal(strength.level, finding.evidence_strength);
});

test("the assessment breakdown is stored so a grade can be read as well as recomputed", () => {
  const { finding } = rowsFor(frameOf([item(), item(), item()]));
  const assessment = finding.assessment as { confidence: { factors: unknown[]; what_would_raise_it: unknown[] } };
  assert.ok(Array.isArray(assessment.confidence.factors));
  assert.ok(assessment.confidence.factors.length > 0);
  assert.ok(Array.isArray(assessment.confidence.what_would_raise_it));
});

// ── Grounds ──────────────────────────────────────────────────────────────────

test("a citation stores its stance, its limit and its observation unit", () => {
  const frame = frameOf([item({ contribution: "established_knowledge" as ContributionKind })]);
  const { evidence } = rowsFor(frame);
  assert.equal(evidence[0].stance, "establishes");
  assert.equal(evidence[0].admissibility, "admissible_with_limits");
  assert.ok(evidence[0].constraint_note);
  assert.equal(evidence[0].observations, 1);
  assert.ok(evidence[0].observation_key.startsWith("unit-"));
});

test("a contesting citation is stored as contesting, not dropped", () => {
  const frame = frameOf([item(), item(), item()]);
  const proposition = assessed(frame, {}, { contesting: [0], qualifying: [] });
  const { evidence } = toRows({
    projectId: "p", need, requirementKey: "r", proposition, rank: 1, runId: "run-1",
  });
  assert.equal(evidence.filter(e => e.stance === "contests").length, 1);
});

test("evidence a claim reached for and could not use is kept, flagged and reasoned", () => {
  const frame = frameOf([item()]);
  const { evidence } = rowsFor(frame, {
    rejectedCitations: [{ evidenceId: "e-rejected", reason: "This kind of evidence cannot support this kind of claim." }],
  });
  const rejected = evidence.filter(e => e.rejected);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].rejected_reason);
  assert.equal(rejected[0].evidence_ref, "e-rejected");
});

test("the snapshot travels with the citation, so a finding stays readable later", () => {
  const { evidence } = rowsFor(frameOf([item({ content: "the queues ruin it", provenance: "Reddit · UK" })]));
  assert.equal(evidence[0].snippet, "the queues ruin it");
  assert.equal(evidence[0].provenance, "Reddit · UK");
});

test("unknown bearing is stored as null, never as zero", () => {
  const { evidence } = rowsFor(frameOf([item({ bearing: null })]));
  assert.equal(evidence[0].bearing, null);
});

// ── Provenance ───────────────────────────────────────────────────────────────

test("a finding records the rules it was formed under, so it stays interpretable", () => {
  const { finding } = rowsFor(frameOf([item()]));
  assert.equal(finding.matrix_version, MATRIX_VERSION);
  assert.equal(finding.assertion_taxonomy_version, ASSERTION_TAXONOMY_VERSION);
  assert.equal(finding.run_id, "run-1");
  assert.equal(finding.model, "test-model");
});

test("whether the challenge ran is stored, distinctly from what it found", () => {
  const frame = frameOf([item(), item()]);
  const untested = toRows({
    projectId: "p", need, requirementKey: "r", rank: 1, runId: "run-1",
    proposition: assess(applyChallenge({
      proposition: { id: "p0", needId: "need_1", statement: "s", assertion: "descriptive", scope: "", warrant: "", reading: "r", citations: shownFor(frame), rejectedCitations: [], isNull: false },
      candidates: projectFor(frame, "descriptive").admitted, raw: null, ran: false,
    }), 2),
  });
  assert.equal(untested.finding.disconfirmed, false);
  assert.equal((untested.finding.disconfirmation as { ran: boolean }).ran, false);
});

test("every row is addressable and distinct", () => {
  const frame = frameOf([item()]);
  const a = rowsFor(frame);
  const b = rowsFor(frame);
  assert.notEqual(a.finding.id, b.finding.id);
  assert.ok(a.evidence.every(e => e.finding_id === a.finding.id));
});
