import { test } from "node:test";
import assert from "node:assert/strict";
import { STRUCTURE_LOCKED_COPY } from "./types";
import { researchDefinitionLocked } from "@/lib/studio/survey-lifecycle";

// The Create/editor inline research-lock hint must mirror the server rule:
// the research definition locks once the survey holds evidence OR is live —
// even before any response arrives. `SurveyStage.locked` is driven by the
// server's `research_locked` flag, which is exactly researchDefinitionLocked(...).

test("lock copy explains the evidence-OR-live rule, including zero responses", () => {
  assert.match(STRUCTURE_LOCKED_COPY, /live/i);                       // covers the live case
  assert.match(STRUCTURE_LOCKED_COPY, /collect/i);                    // covers collection begun
  assert.match(STRUCTURE_LOCKED_COPY, /no responses have arrived/i);  // explicit zero-response wording
  assert.match(STRUCTURE_LOCKED_COPY, /questions and answer options/i);
});

test("editor lock state = researchDefinitionLocked (evidence OR live, not response-count-only)", () => {
  // Live with zero responses → the editor hint shows (the closed hole).
  assert.equal(researchDefinitionLocked({ hasEvidence: false, hasLiveCampaign: true }), true);
  // Collected evidence → locked.
  assert.equal(researchDefinitionLocked({ hasEvidence: true, hasLiveCampaign: false }), true);
  // Draft, never live, no data → editor stays editable.
  assert.equal(researchDefinitionLocked({ hasEvidence: false, hasLiveCampaign: false }), false);
});
