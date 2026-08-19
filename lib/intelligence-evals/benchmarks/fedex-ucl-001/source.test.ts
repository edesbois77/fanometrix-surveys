// Deterministic, CI-safe. Source-fixture integrity + expected arithmetic + a
// drift cross-check against the repository Survey Studio QA fixture. If the
// other session changes lib/studio/qa/fedex-fixture.ts away from the CSV-of-
// record numbers, the cross-check FAILS here rather than silently reconciling.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FEDEX_SOURCE, optionPct, wavePct, groupPct, topLeadPp, governedNumbers, sourceHash,
} from "./source";
import { buildFedexStudy } from "@/lib/studio/qa/fedex-fixture";

test("bases: combined 274 = Survey 1 (196) + Survey v2 (78)", () => {
  assert.equal(FEDEX_SOURCE.combinedBase, 274);
  assert.equal(FEDEX_SOURCE.s1Base, 196);
  assert.equal(FEDEX_SOURCE.s2Base, 78);
  assert.equal(FEDEX_SOURCE.s1Base + FEDEX_SOURCE.s2Base, FEDEX_SOURCE.combinedBase);
});

test("each option's combined count is Survey 1 + Survey v2, and each question sums to its base", () => {
  for (const q of FEDEX_SOURCE.questions) {
    let combined = 0, s1 = 0, s2 = 0;
    for (const o of q.options) {
      assert.equal(o.combined, o.s1 + o.s2, `${q.key}/${o.id}: combined must equal s1+s2`);
      combined += o.combined; s1 += o.s1; s2 += o.s2;
    }
    assert.equal(combined, q.base, `${q.key}: options sum to combined base`);
    assert.equal(s1, q.s1Base, `${q.key}: Survey 1 options sum to 196`);
    assert.equal(s2, q.s2Base, `${q.key}: Survey v2 options sum to 78`);
  }
});

test("Q1 combined percentages match the human-defined gold standard", () => {
  assert.equal(optionPct("q_fit", "strong_fit"), 33.6);
  assert.equal(optionPct("q_fit", "relevant_unclear"), 31.0);
  assert.equal(optionPct("q_fit", "brand_visibility"), 10.6);
  assert.equal(optionPct("q_fit", "never_noticed"), 24.8);
});

test("MUST FIND 1 arithmetic: 33.6% + 31.0% -> 64.6% relevance grouping", () => {
  assert.equal(groupPct([{ question: "q_fit", option: "strong_fit" }, { question: "q_fit", option: "relevant_unclear" }]), 64.6);
});

test("the 2.6pp top lead in Q1 is the small gap the story must not overstate", () => {
  const lead = topLeadPp("q_fit");
  assert.equal(lead.top, "strong_fit");
  assert.equal(lead.next, "relevant_unclear");
  assert.equal(lead.leadPp, 2.6);
});

test("Q2 leads on Rewards (36.5%), ~14.6pp ahead", () => {
  assert.equal(optionPct("q_offer", "rewards"), 36.5);
  const lead = topLeadPp("q_offer");
  assert.equal(lead.top, "rewards");
  assert.equal(lead.leadPp, 14.6);
});

test("Q3 leads on Access to experiences (32.8%), ~8.3pp ahead", () => {
  assert.equal(optionPct("q_help", "experiences_access"), 32.8);
  const lead = topLeadPp("q_help");
  assert.equal(lead.top, "experiences_access");
  assert.equal(lead.leadPp, 8.3);
});

test("prohibited cross-question sum 36.5% + 32.8% = 69.3% is arithmetically reproducible (and forbidden)", () => {
  assert.equal(groupPct([{ question: "q_offer", option: "rewards" }, { question: "q_help", option: "experiences_access" }]), 69.3);
});

test("prohibited same-question relabel 31.0% + 24.8% = 55.8% is arithmetically reproducible (and forbidden)", () => {
  assert.equal(groupPct([{ question: "q_fit", option: "relevant_unclear" }, { question: "q_fit", option: "never_noticed" }]), 55.8);
});

test("MAY FIND wave difference: grassroots Survey 1 24.5% vs Survey v2 9.0% (~15.5pp)", () => {
  const s1 = wavePct("q_offer", "grassroots", "s1");
  const s2 = wavePct("q_offer", "grassroots", "s2");
  assert.equal(s1, 24.5);
  assert.equal(s2, 9.0);
  assert.equal(Math.round((s1 - s2) * 10) / 10, 15.5);
});

test("governedNumbers contains legitimate figures and excludes prohibited groupings", () => {
  const g = governedNumbers();
  for (const n of [33.6, 24.8, 2.6, 14.6, 8.3, 24.5, 9.0, 15.5, 274, 196, 78]) assert.ok(g.includes(n), `governed should include ${n}`);
  for (const n of [64.6, 55.8, 69.3]) assert.ok(!g.includes(n), `governed must NOT include grouping ${n}`);
});

test("source hash is stable-format and non-empty", () => {
  assert.match(sourceHash(), /^sha256:[0-9a-f]{32}$/);
});

test("DRIFT CROSS-CHECK: the Survey Studio QA fixture still matches the benchmark source of record", () => {
  const { study, resultGroups } = buildFedexStudy();
  assert.equal(study.completedResponses, FEDEX_SOURCE.combinedBase, "fixture combined base drifted from the CSV-of-record");

  for (const q of FEDEX_SOURCE.questions) {
    const group = resultGroups.find((g) => g.canonicalQuestionKey === q.key);
    assert.ok(group, `fixture missing question ${q.key}`);
    assert.equal(group!.combined!.base, q.base, `${q.key}: fixture combined base drifted`);
    // Match option counts by LABEL (ids differ between the two representations).
    for (const o of q.options) {
      const fx = group!.combined!.options.find((fo) => fo.label === o.label);
      assert.ok(fx, `${q.key}: fixture missing option "${o.label}"`);
      assert.equal(fx!.count, o.combined, `${q.key}/"${o.label}": fixture count ${fx!.count} != benchmark ${o.combined}`);
    }
    // Wave bases.
    const s1 = group!.sources.find((s) => /survey 1/i.test(s.surveyName));
    const s2 = group!.sources.find((s) => /v2/i.test(s.surveyName));
    assert.equal(s1?.base, q.s1Base, `${q.key}: Survey 1 base drifted`);
    assert.equal(s2?.base, q.s2Base, `${q.key}: Survey v2 base drifted`);
  }
});
