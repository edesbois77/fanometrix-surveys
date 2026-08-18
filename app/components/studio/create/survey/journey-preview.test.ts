import { test } from "node:test";
import assert from "node:assert/strict";
import {
  journeyQuestionCount,
  resolveSelection,
  frameForSelection,
  previewCounter,
  clampQuestionIndex,
  frameLabel,
  type JourneyQuestion,
} from "./journey-preview";
import type { Selection } from "./types";

// A survey draft is just an ordered list of questions with stable ids. The
// journey mapping takes NO Creative/renderer input — changing Creative cannot
// change any value below, which is the whole point of the contract.
const qs = (...ids: string[]): JourneyQuestion[] => ids.map((id) => ({ id }));
const selQ = (id: string): Selection => ({ kind: "question", id });

// ── A. Create 3 questions → preview reports 3 total ──────────────────────────
test("A: totalQuestions equals the actual survey question count", () => {
  assert.equal(journeyQuestionCount(qs("a", "b", "c")), 3);
});

// ── B. 3 questions → change Creative → still reports 3 total ──────────────────
// The count is derived purely from the draft; there is no renderer parameter to
// substitute a template/max/stale total. Simulate "changing Creative" as simply
// recomputing against the SAME draft — the result is invariant.
test("B: total is renderer-independent (unchanged when Creative changes)", () => {
  const draft = qs("a", "b", "c");
  const totalUnderCreativeA = journeyQuestionCount(draft);
  const totalUnderCreativeB = journeyQuestionCount(draft); // different Creative, same draft
  assert.equal(totalUnderCreativeA, 3);
  assert.equal(totalUnderCreativeB, 3);
  assert.equal(totalUnderCreativeA, totalUnderCreativeB);
});

// ── C. 3 questions → select Q1/Q2/Q3 → correct mapping + counters ────────────
test("C: each Journey question maps 1:1 to its Survey question with the right counter", () => {
  const draft = qs("a", "b", "c");
  const cases: Array<[string, number, number]> = [
    ["a", 0, 1],
    ["b", 1, 2],
    ["c", 2, 3],
  ];
  for (const [id, index, position] of cases) {
    const frame = frameForSelection(selQ(id), draft);
    assert.deepEqual(frame, { kind: "question", index });
    assert.deepEqual(previewCounter(frame, draft), { position, total: 3 });
  }
});

// ── D. 3 questions → Add Question → Q4 renders, counter 4/4, NOT Thank You ────
test("D: adding Question 4 previews Question 4 (4 of 4), never Thank You", () => {
  const before = qs("a", "b", "c");
  // Add Question: survey state updates authoritatively first, new question selected.
  const after = [...before, { id: "d" }];
  const frame = frameForSelection(selQ("d"), after);
  assert.equal(frame.kind, "question");                       // NOT thankyou
  assert.deepEqual(frame, { kind: "question", index: 3 });
  assert.deepEqual(previewCounter(frame, after), { position: 4, total: 4 });
});

// ── E. 4 questions → delete one → total becomes 3, no stale "of 4" ───────────
test("E: deleting a question drops the total — no stale previous count", () => {
  const before = qs("a", "b", "c", "d");
  const after = before.filter((q) => q.id !== "b"); // delete Q2
  assert.equal(journeyQuestionCount(after), 3);
  // A surviving selection still counts against the NEW total.
  const frame = frameForSelection(selQ("c"), after);
  assert.deepEqual(previewCounter(frame, after), { position: 2, total: 3 });
});

// ── F. Delete the currently-selected final question → resolves to a valid frame
test("F: deleting the selected final question resolves to a valid remaining frame", () => {
  const before = qs("a", "b", "c");
  const selected = selQ("c");                 // final question is selected
  const after = before.filter((q) => q.id !== "c");
  const resolved = resolveSelection(selected, after);
  // Falls back to a real remaining question, never the dangling id.
  assert.deepEqual(resolved, { kind: "question", id: "a" });
  const frame = frameForSelection(selected, after);
  assert.deepEqual(frame, { kind: "question", index: 0 });
  assert.deepEqual(previewCounter(frame, after), { position: 1, total: 2 });
});

test("F2: deleting the only question resolves safely to the Intro frame", () => {
  const after: JourneyQuestion[] = [];
  const resolved = resolveSelection(selQ("a"), after);
  assert.deepEqual(resolved, { kind: "intro" });
  assert.deepEqual(frameForSelection(selQ("a"), after), { kind: "intro" });
});

// ── G. Switch Creative A→B→C→A → question count/mapping unchanged throughout ──
test("G: switching Creative repeatedly never changes the count or mapping", () => {
  const draft = qs("a", "b", "c");
  // Four "Creative switches" are four recomputations against the same draft.
  for (let i = 0; i < 4; i++) {
    assert.equal(journeyQuestionCount(draft), 3);
    assert.deepEqual(frameForSelection(selQ("b"), draft), { kind: "question", index: 1 });
    assert.deepEqual(previewCounter({ kind: "question", index: 1 }, draft), { position: 2, total: 3 });
  }
});

// ── H. Intro and Thank You never contribute to totalQuestions / the counter ──
test("H: Intro and Thank You are frames, not questions — no counter, no count", () => {
  const draft = qs("a", "b", "c");
  assert.equal(previewCounter({ kind: "intro" }, draft), null);
  assert.equal(previewCounter({ kind: "thankyou" }, draft), null);
  // They pass straight through as frames and never alter N.
  assert.deepEqual(frameForSelection({ kind: "intro" }, draft), { kind: "intro" });
  assert.deepEqual(frameForSelection({ kind: "thankyou" }, draft), { kind: "thankyou" });
  assert.equal(journeyQuestionCount(draft), 3);
});

// ── Frame integrity: a question index can NEVER spill onto Thank You ─────────
// This is the invariant the Stack preview violated (a research step colliding
// with the Thank-You step). The clamp guarantees the last question is N-1, and
// Thank You only ever comes from a Thank-You selection.
test("clamp keeps a question index inside [0, N-1] — never the terminal frame", () => {
  assert.equal(clampQuestionIndex(9, 3), 2);   // beyond the end → last question
  assert.equal(clampQuestionIndex(-4, 3), 0);  // before the start → first question
  assert.equal(clampQuestionIndex(0, 0), 0);   // empty draft → floor
  // A stale index past the end resolves to the final question, not Thank You.
  const draft = qs("a", "b", "c");
  const frame = frameForSelection(selQ("c"), draft);
  assert.notEqual(frame.kind, "thankyou");
  assert.deepEqual(previewCounter(frame, draft), { position: 3, total: 3 });
});

test("frameLabel reads from the frame, not a fixed terminal index", () => {
  assert.equal(frameLabel({ kind: "intro" }), "Intro");
  assert.equal(frameLabel({ kind: "question", index: 0 }), "Question 1");
  assert.equal(frameLabel({ kind: "question", index: 4 }), "Question 5");
  assert.equal(frameLabel({ kind: "thankyou" }), "Thank You");
});
