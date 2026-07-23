import { test } from "node:test";
import assert from "node:assert/strict";
import {
  frameEvidence, projectFor, toCitation, describeFrame, directEvidenceShare,
  DEFAULT_BEARING_FLOOR, type FramedItem,
} from "./framing";
import { deriveConfidence } from "./assessment";
import type { ContributionKind } from "./types";
import type { EvidenceRole } from "@/lib/evidence-role";
import type { MethodFit } from "@/lib/information-needs";

// docs/intelligence-model.md §5 FRAMING. The stage that answers "what can this
// evidence legitimately establish for this question", rather than the question
// that failed in production: "is this evidence any good".

let seq = 0;
function item(over: Partial<FramedItem> = {}): FramedItem {
  seq += 1;
  return {
    evidenceId: `e${seq}`,
    content: `evidence ${seq}`,
    contribution: "unprompted_discourse" as ContributionKind,
    role: "direct" as EvidenceRole,
    bearing: 0.8,
    observationKey: `unit-${seq}`,
    observations: 1,
    methodFit: "primary" as MethodFit,
    provenance: null,
    ...over,
  };
}

const frameOf = (items: FramedItem[]) => frameEvidence({ needId: "need-1", items });

// ── Admission to the frame ───────────────────────────────────────────────────

test("evidence that does not bear on the question is excluded, with a reason", () => {
  const frame = frameOf([item({ bearing: 0.9 }), item({ bearing: 0.2, provenance: "Reddit, UK" })]);
  assert.equal(frame.admitted.length, 1);
  assert.equal(frame.excluded.length, 1);
  assert.equal(frame.excluded[0].reason, "does_not_bear");
  assert.ok(frame.excluded[0].message.includes("Reddit, UK"), "an exclusion must be explainable concretely");
});

test("the examined count includes what was excluded, so the denominator stays honest", () => {
  const frame = frameOf([item({ bearing: 0.9 }), item({ bearing: 0.1 }), item({ bearing: 0.1 })]);
  assert.equal(frame.admitted.length, 1);
  assert.equal(frame.examined, 3, "an absence claim is judged on everything examined, not on what survived");
});

test("the bearing floor is a policy of the question, not of the source", () => {
  const items = [item({ bearing: 0.55 })];
  assert.equal(frameEvidence({ needId: "n", items }).admitted.length, 1);
  assert.equal(frameEvidence({ needId: "n", items, bearingFloor: 0.7 }).admitted.length, 0);
  assert.equal(DEFAULT_BEARING_FLOOR, 0.5);
});

// ── Projection: the same evidence answers some questions and not others ──────

test("the same admitted evidence supports a description and cannot support a measurement", () => {
  // The matrix doing its work: conversation describes what people say, and can
  // never establish what share of a population thinks it.
  const frame = frameOf([
    item({ contribution: "unprompted_discourse" as ContributionKind }),
    item({ contribution: "unprompted_discourse" as ContributionKind }),
  ]);

  const descriptive = projectFor(frame, "descriptive");
  assert.equal(descriptive.admitted.length, 2);
  assert.ok(descriptive.supportable);

  const magnitude = projectFor(frame, "magnitude");
  assert.equal(magnitude.admitted.length, 0);
  assert.equal(magnitude.excluded.length, 2);
  assert.ok(magnitude.excluded[0].message.includes("share of a population"));
  assert.equal(magnitude.supportable, false);
});

test("evidence excluded for one kind of claim stays in the frame for another", () => {
  const frame = frameOf([item({ contribution: "interested_claim" as ContributionKind })]);
  assert.equal(frame.admitted.length, 1, "the frame admits it");
  assert.equal(projectFor(frame, "comparative").admitted.length, 0, "but it can never ground a comparison");
  assert.equal(projectFor(frame, "descriptive").admitted.length, 1, "and it can establish that the claim was made");
});

test("a projection carries the condition each item is admitted under", () => {
  const p = projectFor(frameOf([item({ contribution: "interested_claim" as ContributionKind })]), "descriptive");
  assert.equal(p.admitted[0].admissibility, "admissible_with_limits");
  assert.ok(p.admitted[0].constraint?.includes("attribute"), "the constraint must survive onto the claim");
});

// ── Assigned by the design, not yet judged against the question ──────────────

test("evidence the design assigned but nobody has judged is admitted, not excluded", () => {
  // A survey attached to a project is commissioned to answer a question, but
  // nothing has yet judged how far a particular statistic does so. Null is
  // unknown, never zero, and inventing a number to fill the gap would be the one
  // genuinely dishonest option.
  const frame = frameOf([item({ bearing: null })]);
  assert.equal(frame.admitted.length, 1);
  assert.equal(frame.excluded.length, 0);
});

test("unjudged evidence scores nothing for bearing, which is the conservative outcome", () => {
  const judged = frameOf([item({ bearing: 0.9 }), item({ bearing: 0.9 }), item({ bearing: 0.9 })]);
  const unjudged = frameOf([item({ bearing: null }), item({ bearing: null }), item({ bearing: null })]);

  const cite = (f: ReturnType<typeof frameOf>) =>
    projectFor(f, "descriptive").admitted.map(a => toCitation(a, "establishes"));

  const strong = deriveConfidence({ citations: cite(judged), assertion: "descriptive", disconfirmed: true });
  const weaker = deriveConfidence({ citations: cite(unjudged), assertion: "descriptive", disconfirmed: true });

  assert.equal(strong.level, "High");
  assert.notEqual(weaker.level, "High", "unknown bearing must never read as strong bearing");
});

// ── The design's verdict on the method reaches admissibility ─────────────────

test("evidence from a method the design judged unable to answer the question is excluded", () => {
  const frame = frameOf([
    item({ methodFit: "primary" as MethodFit }),
    item({ methodFit: "not_suitable" as MethodFit }),
  ]);
  const p = projectFor(frame, "descriptive");
  assert.equal(p.admitted.length, 1);
  assert.equal(p.excluded[0].reason, "method_not_suitable");
});

test("a conditional method verdict downgrades evidence rather than excluding it", () => {
  const p = projectFor(frameOf([item({ methodFit: "conditional" as MethodFit })]), "descriptive");
  assert.equal(p.admitted[0].admissibility, "admissible_with_limits");
  assert.ok(p.admitted[0].constraint?.includes("conditionally"));
});

test("method fit can only tighten admissibility, never loosen it", () => {
  // A design calling a method primary must not turn evidence the matrix rules
  // out into evidence it allows. The matrix stays the gate.
  const frame = frameOf([item({ contribution: "unprompted_discourse" as ContributionKind, methodFit: "primary" as MethodFit })]);
  assert.equal(projectFor(frame, "magnitude").admitted.length, 0, "conversation still cannot measure a population");

  const limited = frameOf([item({ contribution: "established_knowledge" as ContributionKind, methodFit: "primary" as MethodFit })]);
  assert.equal(projectFor(limited, "descriptive").admitted[0].admissibility, "admissible_with_limits", "with-limits stays with-limits");
});

// ── What the frame can support, before a word is written ─────────────────────

test("a frame of pure conversation announces that it cannot measure or predict", () => {
  const frame = frameOf([item(), item(), item()]);
  assert.ok(frame.supportable.includes("descriptive"));
  assert.ok(frame.supportable.includes("temporal"));
  assert.ok(!frame.supportable.includes("magnitude"), "conversation volume is not population magnitude");
  assert.ok(!frame.supportable.includes("predictive"), "discourse describes attention, not outcomes");
  assert.ok(!frame.supportable.includes("causal"), "no single kind can establish a cause");
});

test("adding a second kind of evidence makes a causal claim attemptable", () => {
  const conversationOnly = frameOf([item(), item()]);
  assert.ok(!conversationOnly.supportable.includes("causal"));

  const twoKinds = frameOf([item(), item({ contribution: "established_knowledge" as ContributionKind })]);
  assert.ok(twoKinds.supportable.includes("causal"), "corroboration must cross kinds, not pile up within one");
});

test("what a frame promises and what a projection delivers can never disagree", () => {
  const frame = frameOf([item(), item({ contribution: "elicited_perception" as ContributionKind })]);
  for (const a of ["descriptive", "comparative", "magnitude", "temporal", "causal", "predictive", "absence"] as const) {
    assert.equal(frame.supportable.includes(a), projectFor(frame, a).supportable, `disagreement on ${a}`);
  }
});

// ── Absence rests on the search, not on grounds ──────────────────────────────

test("an absence claim is supportable once anything has been examined", () => {
  const examinedNothingRelevant = frameOf([item({ bearing: 0.1 }), item({ bearing: 0.1 })]);
  assert.equal(examinedNothingRelevant.admitted.length, 0);
  assert.ok(projectFor(examinedNothingRelevant, "absence").supportable, "we looked, and that is a finding");
});

test("an empty frame supports nothing at all, including an absence", () => {
  const frame = frameEvidence({ needId: "n", items: [] });
  assert.deepEqual(frame.supportable, [], "never collecting anything is an open question, not a finding");
});

// ── Role is carried, never used to gate ──────────────────────────────────────

test("comparative evidence is admitted to the frame and its share is reported", () => {
  // Role governs attribution, which depends on the claim's subject. Framing does
  // not know the subject, so it reports the mix rather than gating on it.
  const frame = frameOf([
    item({ role: "direct" as EvidenceRole }),
    item({ role: "comparative" as EvidenceRole }),
    item({ role: "comparative" as EvidenceRole }),
    item({ role: "strategic" as EvidenceRole }),
  ]);
  assert.equal(frame.admitted.length, 4);
  assert.equal(frame.roles.comparative, 2);
  assert.equal(directEvidenceShare(frame), 0.25);
  assert.equal(projectFor(frame, "descriptive").admitted.length, 4, "role must not gate admissibility");
});

// ── The seam into assessment ─────────────────────────────────────────────────

test("a projection converts into citations the assessment layer can grade", () => {
  const frame = frameOf([
    item({ contribution: "elicited_perception" as ContributionKind, bearing: 0.9, observationKey: "survey-a", observations: 1 }),
    item({ contribution: "unprompted_discourse" as ContributionKind, bearing: 0.9, observationKey: "reddit", observations: 1 }),
    item({ contribution: "established_knowledge" as ContributionKind, bearing: 0.9, observationKey: "study-x", observations: 1 }),
  ]);
  const projection = projectFor(frame, "descriptive");
  const citations = projection.admitted.map(a => toCitation(a, "establishes"));

  const conf = deriveConfidence({ citations, assertion: "descriptive", disconfirmed: true });
  assert.equal(conf.level, "High");
  assert.equal(citations.length, 3);
});

test("the with-limits verdict survives framing into the grade", () => {
  // established_knowledge is with-limits everywhere, so a claim built only from
  // it is capped however good it looks (compatibility-matrix §6.2).
  const frame = frameOf([
    item({ contribution: "established_knowledge" as ContributionKind, bearing: 0.95, observationKey: "a", observations: 1 }),
    item({ contribution: "established_knowledge" as ContributionKind, bearing: 0.95, observationKey: "b", observations: 1 }),
    item({ contribution: "established_knowledge" as ContributionKind, bearing: 0.95, observationKey: "c", observations: 1 }),
  ]);
  const citations = projectFor(frame, "descriptive").admitted.map(a => toCitation(a, "establishes"));
  const conf = deriveConfidence({ citations, assertion: "descriptive", disconfirmed: true });
  assert.notEqual(conf.level, "High");
});

// ── The analyst surface ──────────────────────────────────────────────────────

test("a frame describes itself in the language of research, not of the model", () => {
  const frame = frameOf([item({ role: "direct" as EvidenceRole }), item({ role: "comparative" as EvidenceRole, bearing: 0.2 })]);
  const text = describeFrame(frame);
  assert.ok(text.includes("1 of 2 items"));
  assert.ok(!/contribution|admissib|assertion/i.test(text), "internal vocabulary must not reach a person");
  assert.ok(!/[—–]/.test(text));
});

test("a frame where nothing bore on the question says so, and is not confused with an empty one", () => {
  assert.ok(describeFrame(frameOf([item({ bearing: 0.1 })])).includes("none of them bears"));
  assert.ok(describeFrame(frameEvidence({ needId: "n", items: [] })).includes("No evidence has been examined"));
});
