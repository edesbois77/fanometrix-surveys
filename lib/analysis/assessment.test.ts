import { test } from "node:test";
import assert from "node:assert/strict";
import { independentLines, contributionKinds, deriveEvidenceStrength, deriveConfidence } from "./assessment";
import type { Citation, CitationStance, ContributionKind, Admissibility } from "./types";

// These tests are the architecture's invariants written as executable claims
// (docs/intelligence-model.md §10). Where one fails, the platform is asserting
// something it is not entitled to, so each test names the invariant it guards.

function cite(over: Partial<Citation> = {}): Citation {
  return {
    stance: "establishes" as CitationStance,
    admissibility: "admissible" as Admissibility,
    contribution: "unprompted_discourse" as ContributionKind,
    line: "line-1",
    weight: 0.8,
    ...over,
  };
}

/** n citations, each on its own independent line. */
const lines = (n: number, over: Partial<Citation> = {}): Citation[] =>
  Array.from({ length: n }, (_, i) => cite({ line: `line-${i}`, ...over }));

// ── Invariant 7: inadmissible evidence contributes nowhere ───────────────────

test("inadmissible evidence is counted nowhere, however much of it there is", () => {
  const grounds = [...lines(3), ...lines(9, { admissibility: "inadmissible" as Admissibility })];
  const ind = independentLines(grounds);
  assert.equal(ind.supporting, 3, "inadmissible items must not add lines");
  assert.equal(ind.items, 3, "inadmissible items must not add weight");
});

test("evidence admitted only with limits cannot carry a claim on its own", () => {
  const full = deriveEvidenceStrength(lines(3));
  const limited = deriveEvidenceStrength(lines(3, { admissibility: "admissible_with_limits" as Admissibility }));
  assert.ok(limited.score < full.score, "with-limits grounds must score below unrestricted ones");
  assert.ok(limited.factors.some(f => f.label.includes("only with limits")));
});

// ── Corroboration requires independence ──────────────────────────────────────

test("fifty carriers of one story are one line of evidence, not fifty", () => {
  // The failure this guards has already shipped once: syndicated coverage read
  // as many independent sources agreeing.
  const syndicated = Array.from({ length: 50 }, () => cite({ line: "wire-story-a" }));
  const ind = independentLines(syndicated);
  assert.equal(ind.supporting, 1);
  assert.equal(ind.items, 50, "the item count is still reported, so the gap is visible");
});

test("a claim resting on a single line can never reach High confidence", () => {
  const conf = deriveConfidence({
    citations: Array.from({ length: 40 }, () => cite({ line: "one-source", weight: 1 })),
    assertion: "descriptive", disconfirmed: true,
  });
  assert.notEqual(conf.level, "High", "one source agreeing with itself is not corroboration");
});

test("diversity is of the kind of knowledge, not of the number of sources", () => {
  const threeSourcesOneKind = lines(3, { contribution: "unprompted_discourse" as ContributionKind });
  assert.deepEqual(contributionKinds(threeSourcesOneKind), ["unprompted_discourse"]);

  const threeKinds = [
    cite({ line: "a", contribution: "unprompted_discourse" as ContributionKind }),
    cite({ line: "b", contribution: "elicited_perception" as ContributionKind }),
    cite({ line: "c", contribution: "established_knowledge" as ContributionKind }),
  ];
  assert.equal(contributionKinds(threeKinds).length, 3);
  assert.ok(
    deriveEvidenceStrength(threeKinds).score > deriveEvidenceStrength(threeSourcesOneKind).score,
    "triangulation across kinds must beat repetition within one kind",
  );
});

// ── An illustration is not evidence ──────────────────────────────────────────

test("a vivid quote illustrates a claim without strengthening it", () => {
  const bare = deriveEvidenceStrength(lines(2));
  const decorated = deriveEvidenceStrength([...lines(2), ...lines(6, { stance: "illustrates" as CitationStance })]);
  assert.equal(decorated.score, bare.score, "illustrations must add no evidential weight");
  assert.equal(decorated.independence.supporting, bare.independence.supporting);
});

// ── Assertion type: the same grounds do not warrant every kind of claim ──────

test("the same evidence warrants a description more confidently than a cause", () => {
  const grounds = lines(3, { weight: 0.85 });
  const descriptive = deriveConfidence({ citations: grounds, assertion: "descriptive", disconfirmed: true });
  const causal = deriveConfidence({ citations: grounds, assertion: "causal", disconfirmed: true });

  assert.equal(descriptive.level, "High");
  assert.ok(causal.level !== "High", "a causal claim is a harder thing to establish");
  assert.ok(
    causal.factors.some(f => f.label.includes("a cause")),
    "the reason for the lower grade must be visible, not silent",
  );
});

test("evidence strength is blind to the kind of claim, because it grades the grounds", () => {
  const grounds = lines(3);
  assert.equal(
    deriveEvidenceStrength(grounds).score,
    deriveEvidenceStrength(grounds).score,
    "strength is a property of the evidence, confidence is a property of the inference",
  );
});

// ── Contradiction lowers confidence, never strength ──────────────────────────

test("contested evidence lowers confidence but does not make the evidence poor", () => {
  const supporting = lines(3);
  const contested = [...supporting, ...lines(3, { stance: "contests" as CitationStance }).map((c, i) => cite({ ...c, line: `against-${i}` }))];

  const strengthAlone = deriveEvidenceStrength(supporting);
  const strengthContested = deriveEvidenceStrength(contested);
  assert.ok(strengthContested.score >= strengthAlone.score, "both sides of a disagreement can rest on good grounds");

  const confAlone = deriveConfidence({ citations: supporting, assertion: "descriptive", disconfirmed: true });
  const confContested = deriveConfidence({ citations: contested, assertion: "descriptive", disconfirmed: true });
  assert.ok(
    levelRank(confContested.level) < levelRank(confAlone.level),
    "a claim the evidence argues with is less safe to assert",
  );
});

// ── Invariant 8: disconfirmation is mandatory, and its absence shows ─────────

test("a claim nobody tried to refute scores below one that survived the attempt", () => {
  const grounds = lines(3, { weight: 0.85 });
  const untested = deriveConfidence({ citations: grounds, assertion: "descriptive", disconfirmed: false });
  const survived = deriveConfidence({ citations: grounds, assertion: "descriptive", disconfirmed: true });

  assert.ok(levelRank(untested.level) < levelRank(survived.level));
  assert.ok(untested.factors.some(f => f.label.includes("Not yet tested")));
  assert.ok(untested.whatWouldRaiseIt.some(s => s.includes("contradict")));
});

// ── Absence is judged on the search, not on the grounds ──────────────────────

test("an absence backed by a thorough search is a confident finding", () => {
  const thorough = deriveConfidence({ citations: [], assertion: "absence", disconfirmed: true, examined: 400 });
  assert.equal(thorough.level, "High");
  assert.ok(thorough.rationale.includes("400"));
});

test("an absence backed by no search at all is not confident", () => {
  const unexamined = deriveConfidence({ citations: [], assertion: "absence", disconfirmed: false, examined: 0 });
  assert.equal(unexamined.level, "Low");
  assert.ok(unexamined.whatWouldRaiseIt.some(s => s.includes("Examining")));
});

// ── The bridge back to research ──────────────────────────────────────────────

test("a claim short of High says what would raise it, naming the actual deficit", () => {
  const conf = deriveConfidence({
    citations: [cite({ line: "only", contribution: "unprompted_discourse" as ContributionKind })],
    assertion: "descriptive", disconfirmed: false,
  });
  const advice = conf.whatWouldRaiseIt.join(" | ");
  assert.ok(advice.includes("contradict"), "it was never disconfirmed");
  assert.ok(advice.includes("independent"), "it rests on one line");
  assert.ok(advice.includes("second kind"), "it rests on one kind of knowledge");
});

test("a claim already at High is not told how to improve", () => {
  const conf = deriveConfidence({
    citations: [
      cite({ line: "a", contribution: "unprompted_discourse" as ContributionKind, weight: 0.9 }),
      cite({ line: "b", contribution: "elicited_perception" as ContributionKind, weight: 0.9 }),
      cite({ line: "c", contribution: "established_knowledge" as ContributionKind, weight: 0.9 }),
    ],
    assertion: "descriptive", disconfirmed: true,
  });
  assert.equal(conf.level, "High");
  assert.deepEqual(conf.whatWouldRaiseIt, []);
});

// ── The compatibility matrix's combination rules (matrix §6) ─────────────────

test("no volume of with-limits evidence adds up to a claim it can carry", () => {
  // compatibility-matrix §6.2. Before the matrix was authored this reached High:
  // six independent lines at high weight outscored the single with-limits
  // penalty, so evidence that cannot carry a claim carried one anyway.
  const conf = deriveConfidence({
    citations: [
      ...lines(6, { admissibility: "admissible_with_limits" as Admissibility, weight: 0.9 }),
      ...lines(3, { admissibility: "admissible_with_limits" as Admissibility, weight: 0.9, contribution: "expert_judgement" as ContributionKind })
        .map((c, i) => cite({ ...c, line: `expert-${i}` })),
    ],
    assertion: "descriptive", disconfirmed: true,
  });
  assert.notEqual(conf.level, "High");
  assert.ok(conf.rationale.includes("admitted only with limits"));
  assert.ok(conf.whatWouldRaiseIt.some(s => s.includes("without limits")));
});

test("a causal claim resting on one kind of evidence is capped at Low, however much there is", () => {
  // compatibility-matrix §6.1. No source can establish a cause alone, so
  // corroboration has to cross kinds rather than pile up within one.
  const conf = deriveConfidence({
    citations: lines(8, { weight: 0.95, contribution: "documented_activity" as ContributionKind }),
    assertion: "causal", disconfirmed: true,
  });
  assert.equal(conf.level, "Low");
  assert.ok(conf.whatWouldRaiseIt[0].includes("different kind"), "the cap must lead the advice");
});

test("evidence of the kind built for a claim is held to a lower bar than evidence working outside its home ground", () => {
  // compatibility-matrix §3: documented activity is native to a comparison of
  // what two parties did; asked opinion is admissible for it but not native.
  const grounds = (contribution: ContributionKind) => lines(3, { contribution, weight: 0.6 });

  const native = deriveConfidence({ citations: grounds("documented_activity"), assertion: "comparative", disconfirmed: true });
  const nonNative = deriveConfidence({ citations: grounds("elicited_perception"), assertion: "comparative", disconfirmed: true });

  assert.equal(native.level, "High");
  assert.equal(nonNative.level, "Medium");
});

// ── Nothing is asserted without grounds ──────────────────────────────────────

test("a claim with no admissible evidence is Low, and says so plainly", () => {
  const conf = deriveConfidence({
    citations: lines(5, { admissibility: "inadmissible" as Admissibility }),
    assertion: "descriptive", disconfirmed: true,
  });
  assert.equal(conf.level, "Low");
  assert.ok(conf.rationale.includes("No admissible evidence"));
});

test("no user-facing rationale uses an em-dash", () => {
  // House style, enforced where it is easiest to regress: generated prose.
  const samples = [
    deriveEvidenceStrength(lines(3)).rationale,
    deriveConfidence({ citations: lines(3), assertion: "causal", disconfirmed: false }).rationale,
    deriveConfidence({ citations: [], assertion: "absence", disconfirmed: true, examined: 30 }).rationale,
  ];
  for (const s of samples) assert.ok(!/[—–]/.test(s), `em-dash in: ${s}`);
});

const levelRank = (l: "High" | "Medium" | "Low"): number => (l === "High" ? 3 : l === "Medium" ? 2 : 1);
