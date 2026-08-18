import { test } from "node:test";
import assert from "node:assert/strict";
import { validateObjective, normaliseIntent, buildObjectiveDraftPrompt } from "./study-objective";

test("validateObjective requires non-empty, bounded text", () => {
  assert.equal(validateObjective("").ok, false);
  assert.equal(validateObjective("   ").ok, false);
  const ok = validateObjective("  Assess fan perceptions of the sponsorship.  ");
  assert.equal(ok.ok, true);
  assert.equal(ok.objective, "Assess fan perceptions of the sponsorship.");
  assert.equal(validateObjective("x".repeat(601)).ok, false);
});

test("normaliseIntent trims and bounds the free-text intent", () => {
  assert.equal(normaliseIntent("  hi  "), "hi");
  assert.equal(normaliseIntent("a".repeat(2000)).length, 1500);
  assert.equal(normaliseIntent(42 as unknown), "");
});

test("buildObjectiveDraftPrompt embeds intent, question context and the 'avoid' draft", () => {
  const p = buildObjectiveDraftPrompt({ intent: "know if FedEx is a natural sponsor", studyName: "FedEx UCL", questions: ["FedEx as a sponsor?", "What should sponsors offer?"], avoid: "An old draft" });
  assert.match(p, /know if FedEx is a natural sponsor/);
  assert.match(p, /FedEx as a sponsor\?/);
  assert.match(p, /materially different/);
  assert.match(p, /"objective"/); // JSON contract
  assert.match(p, /An old draft/);
});

test("buildObjectiveDraftPrompt omits the avoid clause when not retrying", () => {
  const p = buildObjectiveDraftPrompt({ intent: "understand fan value", studyName: "S" });
  assert.doesNotMatch(p, /materially different/);
});
