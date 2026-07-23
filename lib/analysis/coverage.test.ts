import { test } from "node:test";
import assert from "node:assert/strict";
import { coverageForNeed, rollUpCoverage, combineCoverage, type NeedCoverage, type NeedState } from "./coverage";

// Invariant 11: coverage is computed at the information need and never asserted.
// The denominator is what the research design set out to learn, not what
// evidence happened to arrive.

const need = (id: string, state: NeedState): NeedCoverage => ({ needId: id, state, findings: state === "open" ? 0 : 1 });

// ── One need ─────────────────────────────────────────────────────────────────

test("a confident finding answers its question", () => {
  assert.equal(coverageForNeed("n1", [{ confidence: "Medium", isAbsence: false }]).state, "answered");
});

test("a Low-confidence finding is real intelligence but does not close the question", () => {
  assert.equal(coverageForNeed("n1", [{ confidence: "Low", isAbsence: false }]).state, "weak");
});

test("a null finding records that we looked, and deliberately does not close the question", () => {
  assert.equal(coverageForNeed("n1", [{ confidence: "High", isAbsence: true }]).state, "unanswerable");
});

test("a need nobody has examined is open, not answered and not unanswerable", () => {
  // The distinction that matters: silence must never read as diligence.
  assert.equal(coverageForNeed("n1", []).state, "open");
});

test("one confident answer outweighs a null finding on the same question", () => {
  const c = coverageForNeed("n1", [
    { confidence: "High", isAbsence: true },
    { confidence: "High", isAbsence: false },
  ]);
  assert.equal(c.state, "answered");
});

// ── Rollup ───────────────────────────────────────────────────────────────────

test("a requirement whose every question is answered is complete", () => {
  const c = rollUpCoverage([need("a", "answered"), need("b", "answered")]);
  assert.equal(c.level, "complete");
});

test("an unexamined question stops a requirement being called substantial", () => {
  // Examined-and-unanswerable and never-examined are different kinds of
  // incompleteness, and collapsing them lets an untouched question pass as
  // diligence.
  const withOpen = rollUpCoverage([need("a", "answered"), need("b", "answered"), need("c", "open")]);
  const withNull = rollUpCoverage([need("a", "answered"), need("b", "answered"), need("c", "unanswerable")]);

  assert.equal(withOpen.level, "partial");
  assert.equal(withNull.level, "substantial");
});

test("the coverage statement reports what was not answered, not only what was", () => {
  const c = rollUpCoverage([need("a", "answered"), need("b", "weak"), need("c", "unanswerable"), need("d", "open")]);
  assert.ok(c.statement.includes("1 of 4"));
  assert.ok(c.statement.includes("not confidently"));
  assert.ok(c.statement.includes("without finding an answer"));
  assert.ok(c.statement.includes("not yet examined"));
});

test("a requirement with no declared questions claims no coverage", () => {
  const c = rollUpCoverage([]);
  assert.equal(c.level, "open");
  assert.equal(c.total, 0);
  assert.ok(c.statement.includes("No information needs"));
});

// ── Composition ──────────────────────────────────────────────────────────────

test("coverage composes to the next altitude without changing shape", () => {
  const reqA = rollUpCoverage([need("a1", "answered"), need("a2", "answered")]);
  const reqB = rollUpCoverage([need("b1", "answered"), need("b2", "open")]);
  const project = combineCoverage([reqA, reqB]);

  assert.equal(project.total, 4);
  assert.equal(project.answered, 3);
  assert.equal(project.open, 1);
  assert.equal(project.level, "partial", "one unexamined question anywhere keeps the project partial");
});

test("no coverage statement uses an em-dash", () => {
  const samples = [
    rollUpCoverage([need("a", "answered"), need("b", "open")]).statement,
    rollUpCoverage([]).statement,
  ];
  for (const s of samples) assert.ok(!/[—–]/.test(s), `em-dash in: ${s}`);
});
