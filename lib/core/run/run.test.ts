import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprintInput, buildRun } from "./index";
import type { DiscoveryInput } from "../candidates/types";
import { runAnalysis } from "../pipeline/analyse";
import { coreVersions } from "../studio/shadow";

const input = (opts: [string, number][]): DiscoveryInput => ({ questions: [{ questionKey: "q1", questionText: "Q", base: 100, options: opts.map(([id, count]) => ({ id, label: id, count })) }], objective: "obj" });

test("fingerprint is deterministic and order-insensitive; changes when evidence changes", () => {
  const a = fingerprintInput(input([["x", 60], ["y", 40]]));
  const b = fingerprintInput(input([["y", 40], ["x", 60]])); // different option order
  assert.equal(a, b);
  assert.match(a, /^sha256:[0-9a-f]{32}$/);
  assert.notEqual(a, fingerprintInput(input([["x", 61], ["y", 39]]))); // changed counts
});

test("fingerprint ignores objective/wording (metadata), not evidence", () => {
  const base: DiscoveryInput = { questions: [{ questionKey: "q1", questionText: "A", base: 100, options: [{ id: "x", label: "X", count: 60 }, { id: "y", label: "Y", count: 40 }] }], objective: "one" };
  const reworded: DiscoveryInput = { questions: [{ questionKey: "q1", questionText: "B", base: 100, options: [{ id: "x", label: "Z", count: 60 }, { id: "y", label: "W", count: 40 }] }], objective: "two" };
  assert.equal(fingerprintInput(base), fingerprintInput(reworded));
});

test("buildRun captures versions independently, summaries, ledger — and NO chain-of-thought", () => {
  const di = input([["x", 60], ["y", 25], ["z", 15]]);
  const result = runAnalysis(di);
  const run = buildRun({ id: "run1", source: { kind: "survey", id: "s1" }, versions: coreVersions(), startedAt: "T0", completedAt: "T1", status: "completed", input: di, result });
  assert.equal(run.versions.standardVersion, "1.1");
  assert.notEqual(run.versions.pipelineVersion, run.versions.coreVersion); // distinct fields
  assert.ok(run.versions.semanticRubricVersions.grouping);
  assert.ok(run.summaries.candidatesGenerated >= 1);
  assert.ok(run.ledger.length >= 1);
  assert.match(run.inputFingerprint, /^sha256:/);
  // No hidden reasoning field anywhere in the ledger.
  const json = JSON.stringify(run);
  assert.ok(!/chain[_-]?of[_-]?thought|reasoning_trace|scratchpad/i.test(json));
});

test("run is product-agnostic: source identity is generic, not a surveyId field", () => {
  const di = input([["x", 60], ["y", 40]]);
  const run = buildRun({ id: "r", source: { kind: "document_set", id: "doc-7" }, versions: coreVersions(), startedAt: "T0", completedAt: "T1", status: "completed", input: di, result: runAnalysis(di) });
  assert.equal(run.source.kind, "document_set");
  assert.ok(!("surveyId" in run));
});
