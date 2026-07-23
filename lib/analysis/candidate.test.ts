import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChallenge, buildChallengePrompt, type TestedProposition, type TestedSet } from "./disconfirmation";
import { assess, rank, toCandidate, explainChoice, needsAttention } from "./candidate";
import { frameEvidence, projectFor, type FramedItem } from "./framing";
import { shownFor } from "./formation";
import type { CandidateProposition } from "./formation";
import type { AssertionType, ContributionKind } from "./types";
import type { EvidenceRole } from "@/lib/evidence-role";
import type { MethodFit } from "@/lib/information-needs";

// Disconfirmation, assessment and ranking. Every proposition is actively
// challenged against the FULL admissible frame before anything grades it
// (invariant 8), and the rivals it beat travel with it so the choice can be
// reopened.

let seq = 0;
const item = (over: Partial<FramedItem> = {}): FramedItem => {
  seq += 1;
  return {
    evidenceId: `e${seq}`, content: `evidence ${seq}`,
    contribution: "unprompted_discourse" as ContributionKind, role: "direct" as EvidenceRole,
    bearing: 0.85, observationKey: `unit-${seq}`, observations: 1,
    methodFit: "primary" as MethodFit, provenance: null, ...over,
  };
};
const frameOf = (items: FramedItem[]) => frameEvidence({ needId: "need_1", items });

const proposition = (frame: ReturnType<typeof frameOf>, over: Partial<CandidateProposition> = {}): CandidateProposition => ({
  id: "need_1:p0", needId: "need_1",
  statement: "Price is what holds this audience back.",
  assertion: "descriptive" as AssertionType,
  scope: "UK fans, 2026", warrant: "Cost is raised unprompted across the evidence.",
  reading: "price is the barrier",
  citations: shownFor(frame),
  rejectedCitations: [], isNull: false, ...over,
});

// ── The challenge is against the whole frame ─────────────────────────────────

test("an item the claim cited can still be found to argue against it", () => {
  // The claim read it too generously. On an adversarial reading it contests, and
  // it must not also be counted for the claim.
  const frame = frameOf([item(), item(), item()]);
  const p = proposition(frame);
  const candidates = projectFor(frame, "descriptive").admitted;

  const tested = applyChallenge({ proposition: p, candidates, raw: { contesting: [0], qualifying: [] }, ran: true });

  assert.equal(tested.citations.filter(c => c.stance === "contests").length, 1);
  assert.equal(tested.citations.filter(c => c.stance === "establishes").length, 2);
  assert.equal(tested.citations.filter(c => c.evidenceId === candidates[0].evidenceId)[0].stance, "contests");
});

test("evidence never cited by the claim can still be brought against it", () => {
  // The whole point of challenging against the full frame rather than the
  // citations: a claim built from the items that fit must face the ones that did
  // not.
  const frame = frameOf([item(), item(), item()]);
  const candidates = projectFor(frame, "descriptive").admitted;
  const p = proposition(frame, { citations: [candidates[0]] });

  const tested = applyChallenge({ proposition: p, candidates, raw: { contesting: [2], qualifying: [] }, ran: true });
  assert.equal(tested.citations.length, 2);
  assert.equal(tested.disconfirmation.contesting, 1);
});

test("contesting beats qualifying, so a model cannot soften its own objection", () => {
  const frame = frameOf([item(), item()]);
  const candidates = projectFor(frame, "descriptive").admitted;
  const tested = applyChallenge({
    proposition: proposition(frame), candidates,
    raw: { contesting: [0], qualifying: [0, 1] }, ran: true,
  });
  assert.equal(tested.citations.find(c => c.evidenceId === candidates[0].evidenceId)!.stance, "contests");
  assert.equal(tested.disconfirmation.qualifying, 1);
});

test("a challenge that could not run is recorded as untested, never as survived", () => {
  const frame = frameOf([item()]);
  const tested = applyChallenge({ proposition: proposition(frame), candidates: [], raw: null, ran: false });
  assert.equal(tested.disconfirmation.ran, false);
  assert.ok(tested.disconfirmation.note.includes("has not been tested"));
});

test("the challenge prompt tells the reviewer to break the claim, not to support it", () => {
  const frame = frameOf([item()]);
  const prompt = buildChallengePrompt({
    proposition: proposition(frame), need: "What holds fans back?",
    candidates: projectFor(frame, "descriptive").admitted,
  });
  assert.ok(prompt.includes("BREAK the claim"));
  assert.ok(prompt.includes("LOOK FOR THE COUNTER CASE FIRST"));
  assert.ok(prompt.includes("BE HONEST WHEN IT HOLDS"));
  assert.ok(prompt.includes("do not say how confident you are"));
  assert.ok(prompt.includes("including the parts the claim already rests on"));
});

// ── Assessment grades the challenged claim ───────────────────────────────────

test("a claim that survived a challenge outscores the same claim never challenged", () => {
  const frame = frameOf([item(), item(), item()]);
  const candidates = projectFor(frame, "descriptive").admitted;

  const survived = assess(applyChallenge({ proposition: proposition(frame), candidates, raw: { contesting: [], qualifying: [] }, ran: true }), 3);
  const untested = assess(applyChallenge({ proposition: proposition(frame), candidates, raw: null, ran: false }), 3);

  assert.equal(survived.confidence.level, "High");
  assert.notEqual(untested.confidence.level, "High");
  assert.ok(untested.confidence.factors.some(f => f.label.includes("Not yet tested")));
});

test("contesting evidence found by the challenge lowers the grade it earns", () => {
  const frame = frameOf([item(), item(), item(), item()]);
  const candidates = projectFor(frame, "descriptive").admitted;

  const clean = assess(applyChallenge({ proposition: proposition(frame), candidates, raw: { contesting: [], qualifying: [] }, ran: true }), 4);
  const contested = assess(applyChallenge({ proposition: proposition(frame), candidates, raw: { contesting: [0, 1], qualifying: [] }, ran: true }), 4);

  assert.ok(
    ["Medium", "Low"].includes(contested.confidence.level),
    "a claim the evidence argues with cannot grade as though it did not",
  );
  assert.equal(clean.confidence.level, "High");
});

// ── Ranking is derived, and the null can win ─────────────────────────────────

const tested = (over: Partial<CandidateProposition>, frame: ReturnType<typeof frameOf>): TestedProposition =>
  applyChallenge({
    proposition: proposition(frame, over),
    candidates: projectFor(frame, "descriptive").admitted,
    raw: { contesting: [], qualifying: [] }, ran: true,
  });

test("a thorough absence outranks a weakly supported positive claim", () => {
  // Where the best reading is thin and the search was thorough, "we could not
  // establish this" is the better answer and must be able to win.
  const thin = frameOf([item({ bearing: 0.55 })]);
  const weakPositive = assess(tested({ id: "p0" }, thin), 60);
  const nullClaim = assess(
    applyChallenge({
      proposition: proposition(thin, { id: "p1", isNull: true, assertion: "absence", citations: [], statement: "The evidence does not establish what holds fans back." }),
      candidates: [], raw: { contesting: [], qualifying: [] }, ran: true,
    }),
    60,
  );

  const [top] = rank([weakPositive, nullClaim]);
  assert.equal(top.id, "p1");
  assert.equal(top.confidence.level, "High", "a thorough search is a confident absence");
});

test("a stronger positive claim outranks an absence, so the null is not a default", () => {
  const frame = frameOf([item(), item(), item()]);
  const strong = assess(tested({ id: "p0" }, frame), 3);
  const nullClaim = assess(
    applyChallenge({
      proposition: proposition(frame, { id: "p1", isNull: true, assertion: "absence", citations: [] }),
      candidates: [], raw: null, ran: false,
    }),
    3,
  );
  assert.equal(rank([nullClaim, strong])[0].id, "p0");
});

// ── The candidate carries its rivals ─────────────────────────────────────────

test("the rivals a candidate beat travel with it, so the choice can be reopened", () => {
  const frame = frameOf([item(), item(), item()]);
  const set: TestedSet = {
    needId: "need_1", need: "What holds fans back?", examined: 3, disconfirmed: true,
    propositions: [
      tested({ id: "p0", reading: "price" }, frame),
      tested({ id: "p1", reading: "trust", citations: [projectFor(frame, "descriptive").admitted[0]] }, frame),
    ],
  };
  const { candidate, assessed } = toCandidate(set);

  assert.ok(candidate);
  assert.equal(assessed.length, 2);
  assert.equal(candidate!.alternatives.length, 1);
  assert.notEqual(candidate!.id, candidate!.alternatives[0].id);
});

test("a need with nothing proposed yields no candidate, which is open and not an absence", () => {
  const empty: TestedSet = { needId: "need_1", need: "q", examined: 0, disconfirmed: false, propositions: [] };
  assert.equal(toCandidate(empty).candidate, null);
});

// ── The analyst surface ──────────────────────────────────────────────────────

test("the choice explains itself without exposing the model's vocabulary", () => {
  const frame = frameOf([item(), item(), item()]);
  const set: TestedSet = {
    needId: "need_1", need: "q", examined: 3, disconfirmed: true,
    propositions: [tested({ id: "p0" }, frame), tested({ id: "p1", citations: [projectFor(frame, "descriptive").admitted[0]] }, frame)],
  };
  const text = explainChoice(toCandidate(set).candidate!);
  assert.ok(text.includes("chosen over"));
  assert.ok(text.includes("can be reopened"));
  assert.ok(!/assertion|admissib|proposition/i.test(text));
  assert.ok(!/[—–]/.test(text));
});

test("what an analyst must look at is flagged, including a rival that is just as well supported", () => {
  const frame = frameOf([item(), item(), item()]);
  const a = projectFor(frame, "descriptive").admitted;
  const set: TestedSet = {
    needId: "need_1", need: "q", examined: 3, disconfirmed: true,
    propositions: [
      tested({ id: "p0", citations: a }, frame),
      tested({ id: "p1", reading: "the other reading", citations: a }, frame),
    ],
  };
  const flags = needsAttention(toCandidate(set).candidate!);
  assert.ok(flags.some(f => f.includes("supported exactly as well")));
});

test("an untested or contested candidate is flagged for a person", () => {
  const frame = frameOf([item(), item()]);
  const candidates = projectFor(frame, "descriptive").admitted;

  const untested = toCandidate({
    needId: "n", need: "q", examined: 2, disconfirmed: false,
    propositions: [applyChallenge({ proposition: proposition(frame), candidates, raw: null, ran: false })],
  }).candidate!;
  assert.ok(needsAttention(untested).some(f => f.includes("never tested")));

  const contested = toCandidate({
    needId: "n", need: "q", examined: 2, disconfirmed: true,
    propositions: [applyChallenge({ proposition: proposition(frame), candidates, raw: { contesting: [0], qualifying: [] }, ran: true })],
  }).candidate!;
  assert.ok(needsAttention(contested).some(f => f.includes("points the other way")));
});
