import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STACK_RESEARCH_START,
  stackThankYouStep,
  stackResearchCounter,
  resolveStackPreviewStep,
  parseStackPreviewFrame,
} from "./stack-frames";

// ── Counter: Survey questions only (demographics/intro/thank-you never count) ──

test("Stack + 1 Survey question → research question displays 1 of 1", () => {
  assert.deepEqual(stackResearchCounter(0, 1), { position: 1, total: 1 });
});

test("Stack + 3 Survey questions → 1/3, 2/3, 3/3", () => {
  assert.deepEqual(stackResearchCounter(0, 3), { position: 1, total: 3 });
  assert.deepEqual(stackResearchCounter(1, 3), { position: 2, total: 3 });
  assert.deepEqual(stackResearchCounter(2, 3), { position: 3, total: 3 });
});

test("gender/age do not change the Survey total — the counter is a function of nq only", () => {
  // Gender/age are steps 1 and 2 and never call stackResearchCounter; the research
  // total is purely the Survey question count. Two demographic frames existing does
  // not turn a 3-question survey into "of 5".
  assert.equal(stackResearchCounter(0, 3).total, 3);
  assert.equal(STACK_RESEARCH_START, 3); // 0 intro · 1 gender · 2 age · 3 first research Q
});

test("changing Creative to Stack with 3 questions → still 3 total", () => {
  // The counter takes no Creative input, so switching into the Stack cannot change N.
  for (const qi of [0, 1, 2]) assert.equal(stackResearchCounter(qi, 3).total, 3);
});

// ── Semantic preview-frame resolution ────────────────────────────────────────

test("intro resolves to the intro step; thankyou to the terminal step", () => {
  assert.equal(resolveStackPreviewStep({ kind: "intro" }, 3), 0);
  assert.equal(resolveStackPreviewStep({ kind: "thankyou" }, 3), stackThankYouStep(3)); // 6
});

test("question:N maps to the Nth research question step", () => {
  assert.equal(resolveStackPreviewStep({ kind: "question", index: 0 }, 3), STACK_RESEARCH_START);     // 3
  assert.equal(resolveStackPreviewStep({ kind: "question", index: 1 }, 3), STACK_RESEARCH_START + 1); // 4
  assert.equal(resolveStackPreviewStep({ kind: "question", index: 2 }, 3), STACK_RESEARCH_START + 2); // 5
});

test("Add Q4 while persisted DB is still at 3 → preview cannot show Thank You", () => {
  const nqDb = 3;                                   // DB still behind the live draft
  const step = resolveStackPreviewStep({ kind: "question", index: 3 }, nqDb); // Journey selected Q4
  assert.notEqual(step, stackThankYouStep(nqDb));   // NOT the terminal frame
  assert.ok(step < stackThankYouStep(nqDb));        // it is a research step
  assert.equal(step, STACK_RESEARCH_START + 2);     // clamps to newest available (Q3)
});

test("Q4 once persisted → resolves to Q4 and reads 4 of 4", () => {
  const nq = 4;
  assert.equal(resolveStackPreviewStep({ kind: "question", index: 3 }, nq), STACK_RESEARCH_START + 3);
  assert.deepEqual(stackResearchCounter(3, nq), { position: 4, total: 4 });
});

test("Delete Q4 → total returns to 3 and selection resolves safely", () => {
  const nq = 3;
  // A selection that pointed at the now-removed Q4 clamps to the last real question.
  const step = resolveStackPreviewStep({ kind: "question", index: 3 }, nq);
  assert.equal(step, STACK_RESEARCH_START + 2);
  assert.deepEqual(stackResearchCounter(step - STACK_RESEARCH_START, nq), { position: 3, total: 3 });
});

test("Thank-You semantic selection still opens Thank You", () => {
  for (const nq of [1, 3, 5]) {
    assert.equal(resolveStackPreviewStep({ kind: "thankyou" }, nq), stackThankYouStep(nq));
  }
});

test("a question:N frame can NEVER resolve to the Thank-You step (any nq, any index)", () => {
  for (const nq of [1, 2, 3, 4, 5]) {
    for (const index of [0, 1, 2, 5, 99, -3]) {
      const step = resolveStackPreviewStep({ kind: "question", index }, nq);
      assert.ok(step < stackThankYouStep(nq), `question index ${index} @ nq ${nq} must stay below thankyou`);
      assert.ok(step >= STACK_RESEARCH_START, "must be a research step");
    }
  }
});

// ── Inline Studio preview: questions ARE the live draft, so the counter is just
//    stackResearchCounter(qi, liveCount). No persisted/live split, no override. ──
test("inline preview counter follows the live draft count directly", () => {
  // 1 live question → 1 of 1; 3 → 1/2/3 of 3; add Q4 (live 4) → Q4 is 4 of 4.
  assert.deepEqual(stackResearchCounter(0, 1), { position: 1, total: 1 });
  for (const qi of [0, 1, 2]) assert.equal(stackResearchCounter(qi, 3).total, 3);
  assert.deepEqual(stackResearchCounter(3, 4), { position: 4, total: 4 });
  assert.deepEqual(stackResearchCounter(4, 5), { position: 5, total: 5 });
  // Deletes: live count drops immediately.
  assert.deepEqual(stackResearchCounter(3, 4), { position: 4, total: 4 }); // 5→4
  assert.deepEqual(stackResearchCounter(2, 3), { position: 3, total: 3 }); // 4→3
});

test("inline preview step: selecting live question N maps to its research step, never Thank You", () => {
  for (const live of [1, 2, 3, 4, 5]) {
    for (let idx = 0; idx < live; idx++) {
      const step = resolveStackPreviewStep({ kind: "question", index: idx }, live);
      assert.equal(step, STACK_RESEARCH_START + idx); // exact question (no clamp needed inline)
      assert.ok(step < stackThankYouStep(live));      // never Thank You
    }
  }
});

// ── Param parsing ────────────────────────────────────────────────────────────

test("parseStackPreviewFrame reads the semantic params (and ignores raw numeric)", () => {
  assert.deepEqual(parseStackPreviewFrame("intro", null), { kind: "intro" });
  assert.deepEqual(parseStackPreviewFrame("thankyou", null), { kind: "thankyou" });
  assert.deepEqual(parseStackPreviewFrame("question", "2"), { kind: "question", index: 2 });
  assert.deepEqual(parseStackPreviewFrame("question", null), { kind: "question", index: 0 });
  assert.equal(parseStackPreviewFrame("3", null), null);   // raw numeric (static card) → not semantic
  assert.equal(parseStackPreviewFrame(null, null), null);
});
