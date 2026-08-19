// ── Coverage fix — surfacing governed snapshot facts as OBSERVED findings (pure) ─
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectSnapshotFacts, SEGMENT_CAP } from "./snapshot-facts";

const SNAP = {
  evidence: [
    { ref: "e:rewards", question: "What should sponsors offer fans?", optionLabel: "Rewards and benefits", count: 66, base: 196, percentage: 33.7 },
    { ref: "e:grassroots", question: "What should sponsors offer fans?", optionLabel: "Investment in grassroots", count: 48, base: 196, percentage: 24.5 },
  ],
  derived: [
    { ref: "d:leader:q2", kind: "leader", canonicalQuestionKey: "q2", question: "What should sponsors offer fans?", label: "Leading option …", value: 9.2, unit: "pp", inputRefs: ["e:rewards", "e:grassroots"], detail: { leader: "Rewards and benefits", leaderPct: 33.7, second: "Investment in grassroots", secondPct: 24.5 } },
    { ref: "d:grouped:q2", kind: "grouped_share", canonicalQuestionKey: "q2", question: "What should sponsors offer fans?", label: "The two most-selected options together account for 58.2%", value: 58.2, unit: "%", inputRefs: [], detail: {} },
  ],
  segmentDerived: [
    { ref: "s:germany", kind: "seg_spread", canonicalQuestionKey: "q1", question: "FedEx as a sponsor?", dimension: "market", label: "'Never noticed them' ranges 18.6%–40.9% across markets (highest among Germany respondents)", value: 22.3, unit: "pp", inputRefs: [], detail: {} },
    { ref: "s:uk", kind: "seg_concentration", canonicalQuestionKey: "q3", question: "How could FedEx help fans?", dimension: "market", label: "Connecting football fans is chosen by 41.9% of UK respondents, compared with 25.1% overall", value: 16.8, unit: "pp", inputRefs: [], detail: {} },
    { ref: "s:consistency", kind: "seg_consistency", canonicalQuestionKey: "q2", question: "?", dimension: "market", label: "consistent across markets", value: 1, unit: "bool", inputRefs: [], detail: {} },
  ],
};

test("§A leader derived fact → OBSERVED supporting finding with statistic + resolved evidence", () => {
  const { findings } = projectSnapshotFacts(SNAP);
  const leader = findings.find((f) => f.id === "d:leader:q2")!;
  assert.ok(leader);
  assert.equal(leader.basis, "observed", "never governed");
  assert.equal(leader.tier, "supporting");
  assert.equal(leader.statistic, "33.7%");
  assert.match(leader.title, /most-selected/i);
  assert.equal(leader.evidence.length, 2, "resolves inputRefs to base rows");
  assert.ok(leader.evidence.every((e) => e.base === 196));
});

test("§9 grouped_share (top-two combined) is NOT surfaced (held — implies ungoverned construct)", () => {
  const { findings } = projectSnapshotFacts(SNAP);
  assert.ok(!findings.some((f) => f.id === "d:grouped:q2"), "top-two grouping stays held");
});

test("§B segment facts surface as OBSERVED, most-material first, capped", () => {
  const { findings } = projectSnapshotFacts(SNAP);
  const segs = findings.filter((f) => f.id.startsWith("s:"));
  assert.ok(segs.length <= SEGMENT_CAP);
  // highest |value| (spread 22.3) leads the concentration (16.8)
  assert.equal(segs[0].id, "s:germany");
  assert.equal(segs.find((f) => f.id === "s:uk")!.tier, "supporting", "concentration is prominent");
  assert.equal(segs.find((f) => f.id === "s:germany")!.tier, "context", "range/spread is contextual");
});

test("§E/§F/§G surfaced facts never claim significance/causality/majority", () => {
  const { findings } = projectSnapshotFacts(SNAP);
  for (const f of findings) {
    assert.equal(f.basis, "observed", "never DERIVED");
    assert.doesNotMatch(f.title, /significant|significantly|majority|overwhelming|because|causes?|drives?/i);
  }
});

test("leaderQuestions reports which questions now have a richer leader fact (for dedup)", () => {
  const { leaderQuestions } = projectSnapshotFacts(SNAP);
  assert.ok(leaderQuestions.has("What should sponsors offer fans?"));
});

test("§R empty / malformed snapshot facts don't throw", () => {
  assert.deepEqual(projectSnapshotFacts({}).findings, []);
  assert.deepEqual(projectSnapshotFacts({ derived: "nonsense", segmentDerived: 5 } as never).findings, []);
});
