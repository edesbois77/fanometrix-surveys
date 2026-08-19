import { test } from "node:test";
import assert from "node:assert/strict";
import { GOVERNANCE_RULES } from "./rules";
import { PROMPT_FRAGMENTS, promptFragment, assembleFragments } from "./prompt-fragments";

test("every rule that declares a prompt fragment has a non-empty one", () => {
  for (const r of GOVERNANCE_RULES) {
    if (r.hasPromptFragment) {
      const f = promptFragment(r.id);
      assert.ok(f && f.trim().length > 20, `${r.id} fragment too short/missing`);
    }
  }
});

test("fragments reflect Standard v1.1 wording for key rules", () => {
  assert.match(PROMPT_FRAGMENTS.unsupported_causation, /not causation/i);
  assert.match(PROMPT_FRAGMENTS.cross_question_arithmetic, /different questions/i);
  assert.match(PROMPT_FRAGMENTS.unsupported_trend, /snapshot|time series|change over time/i);
  assert.match(PROMPT_FRAGMENTS.aggregate_to_respondent_inference, /respondent-level|same respondents/i);
});

test("assembleFragments selects, orders and dedupes", () => {
  const out = assembleFragments(["unsupported_causation", "unsupported_causation", "cross_question_arithmetic"]);
  const lines = out.split("\n");
  assert.equal(lines.length, 2); // deduped
  assert.ok(lines[0].startsWith("- "));
  assert.match(lines[0], /causation/i);
  assert.match(lines[1], /different questions/i);
});
