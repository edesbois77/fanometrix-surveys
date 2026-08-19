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

test("§B segment facts surface as OBSERVED, most-USEFUL first (pointed beats wide-range), capped", () => {
  const { findings } = projectSnapshotFacts(SNAP);
  const segs = findings.filter((f) => f.id.startsWith("s:"));
  assert.ok(segs.length <= SEGMENT_CAP);
  // A pointed concentration ("41.9% of UK") is more worth pointing out than a wide
  // range/spread even at slightly lower magnitude — so s:uk leads s:germany.
  assert.equal(segs[0].id, "s:uk");
  assert.equal(segs.find((f) => f.id === "s:uk")!.tier, "supporting", "concentration is prominent");
  assert.equal(segs.find((f) => f.id === "s:germany")!.tier, "context", "range/spread is contextual");
});

test("segment findings carry a SHORT neutral takeaway, with the governed label as the evidence line", () => {
  const snap = {
    evidence: [],
    derived: [],
    segmentDerived: [
      { ref: "s:conc", kind: "seg_concentration", canonicalQuestionKey: "q3", question: "How could FedEx help fans?", dimension: "market", label: "\"Connecting football fans\" is chosen by 41.9% of United Kingdom respondents, compared with 25.1% overall", value: 16.8, unit: "pp", inputRefs: [], detail: { option: "Connecting football fans", group: "United Kingdom", groupPct: 41.9, overallPct: 25.1 } },
      { ref: "s:rev", kind: "seg_reversal", canonicalQuestionKey: "q1", question: "FedEx as a sponsor?", dimension: "market", label: "The most-selected answer differs by market: \"Strong natural fit\" leads among France respondents, but \"Never noticed them\" among Germany respondents", value: 3, unit: "bool", inputRefs: [], detail: { dominantOption: "Strong natural fit", groups: [] } },
    ],
  };
  const segs = projectSnapshotFacts(snap as never).findings.filter((f) => f.id.startsWith("s:"));
  const conc = segs.find((f) => f.id === "s:conc")!;
  const rev = segs.find((f) => f.id === "s:rev")!;
  assert.equal(conc.takeaway, "United Kingdom respondents stand out on “Connecting football fans”");
  assert.equal(rev.takeaway, "“Strong natural fit” leads overall, but not among every market");
  // The precise measured statement is preserved verbatim as the evidence (title).
  assert.match(conc.title, /41\.9% of United Kingdom respondents, compared with 25\.1% overall/);
  // A takeaway must NEVER be stronger than its evidence: no interpretation, no numbers
  // the evidence introduced, no magnitude claim.
  for (const t of [conc.takeaway!, rev.takeaway!]) {
    assert.doesNotMatch(t, /concern|problem|opportunity|success|failure|significant|majority|because|drives?|causes?/i, "no interpretation");
    assert.doesNotMatch(t, /\d/, "takeaway asserts no numeric magnitude of its own");
  }
});

test("§7 a device (technical) segment is de-prioritised below an equal-magnitude market (research) segment", () => {
  const mk = (dim: string) => ({ ref: `s:${dim}`, kind: "seg_reversal", canonicalQuestionKey: "q1", question: "Q?", dimension: dim, label: `differs by ${dim}`, value: 3, unit: "bool", inputRefs: [], detail: {} });
  const snap = { evidence: [], derived: [], segmentDerived: [mk("device"), mk("market")] };
  const segs = projectSnapshotFacts(snap as never).findings.filter((f) => f.id.startsWith("s:"));
  const market = segs.find((f) => f.id === "s:market")!;
  const device = segs.find((f) => f.id === "s:device")!;
  assert.ok((market.usefulness ?? 0) > (device.usefulness ?? 0), "market outranks device for the same finding");
});

test("§9b redundant segment facts on the SAME (question,dimension) collapse to the most useful", () => {
  const snap = {
    ...SNAP,
    segmentDerived: [
      { ref: "s:uk-range", kind: "seg_spread", canonicalQuestionKey: "q3", question: "How could FedEx help fans?", dimension: "market", label: "Connecting football fans ranges 13.7%–41.9% across markets", value: 28.2, unit: "pp", inputRefs: [], detail: {} },
      { ref: "s:uk-conc", kind: "seg_concentration", canonicalQuestionKey: "q3", question: "How could FedEx help fans?", dimension: "market", label: "Connecting football fans is chosen by 41.9% of UK respondents, compared with 25.1% overall", value: 16.8, unit: "pp", inputRefs: [], detail: {} },
    ],
  };
  const segs = projectSnapshotFacts(snap).findings.filter((f) => f.id.startsWith("s:"));
  assert.equal(segs.length, 1, "one fact per (question, dimension)");
  assert.equal(segs[0].id, "s:uk-conc", "the pointed concentration wins over the wide range");
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
