import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// GUARDRAIL: Discover must NEVER invoke the model. The Findings endpoint may only
// READ the cached analysis (getCurrentSurveyAnalysis); it must not import or call
// the generator (analyseSurvey) or the model primitive (completeJSON).
const here = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(join(here, "route.ts"), "utf8");

test("Discover findings route reads the cached analysis, never generates", () => {
  assert.match(route, /getCurrentSurveyAnalysis/, "should read the cached analysis");
  assert.doesNotMatch(route, /\banalyseSurvey\b/, "must not call the generator from Discover");
  assert.doesNotMatch(route, /completeJSON/, "must not call the model from Discover");
});
