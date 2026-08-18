import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(dir, f), "utf8");
const detail = read("ManageSurveyDetail.tsx");
const list = read("ManageSurveysList.tsx");
const study = read("ManageStudy.tsx");

// ── Manage → Survey detail: no duplicate consumption nav; Analysis is a header action ──
test("Manage → Survey no longer embeds Results/Findings consumption navigation", () => {
  assert.doesNotMatch(detail, /import\s*\{\s*ManageSurveyResults\s*\}/);
  assert.doesNotMatch(detail, /import\s*\{\s*ManageSurveyFindings\s*\}/);
  assert.doesNotMatch(detail, /<ManageSurveyResults\b/);
  assert.doesNotMatch(detail, /<ManageSurveyFindings\b/);
  assert.doesNotMatch(detail, /\["manage",\s*"results",\s*"findings"\]/); // the old bottom tab set
});
test("Manage → Survey provides a 'View in Discover' action", () => {
  assert.match(detail, /View in Discover/);
  assert.match(detail, /onViewInDiscover/);
  // Discover IA: a survey is a top-level Discover object at /discover/surveys/[id].
  assert.match(detail, /discover\/surveys\/\$\{surveyId\}/);
});
test("old bottom Analysis control card is gone; Analysis is a header action", () => {
  assert.doesNotMatch(detail, /function AnalysisControl\b/);
  assert.doesNotMatch(detail, /Generate analysis/); // old card label
  assert.match(detail, /onAnalyse/);                // header action wired
  assert.match(detail, /Regenerate analysis/);      // truthful header state
});

// ── Manage → Studies navigation is untouched ─────────────────────────────────
test("Manage → Study tabs remain Overview | Results | Analysis | Findings | Reports | Surveys", () => {
  for (const t of ["overview", "results", "analysis", "findings", "reports", "surveys"]) {
    assert.match(study, new RegExp(`"${t}"`), `Study tab ${t} present`);
  }
});

// ── Manage → Surveys list: clickable row + quick actions, projection of pure matrix ──
test("list rows are clickable via a role=button identity (not a wrapping <button>) so quick actions don't nest", () => {
  assert.match(list, /role="button"/);
  assert.match(list, /openDetail\(s\.id\)/);
  assert.match(list, /surveyListActions\(/);        // projection of the pure matrix
});
test("list quick actions call the SAME server endpoints as the detail page", () => {
  assert.match(list, /\/api\/studio\/surveys\/\$\{s\.id\}\/analysis/); // same analysis endpoint
  assert.match(list, /method: "DELETE"/);                              // same delete guard
  assert.match(list, /_action:\s*action/);                             // same archive/restore action
});
test("list uses AUTHORITATIVE analysis eligibility, not a response_count>0 proxy", () => {
  assert.match(list, /analysisEligible:\s*!!s\.analysis_eligible/);    // passes the authoritative flag
  assert.doesNotMatch(list, /response_count\s*>\s*0/);                 // no response-count proxy for Analyse
  assert.doesNotMatch(list, /responses\s*>\s*0\s*\?\s*"[Aa]nalyse/);   // no ad-hoc analyse-by-responses
});

// ── GET /api/surveys eligibility: shared predicate + batched (no N+1) ─────────
const surveysRoute = readFileSync(join(dir, "../../../api/surveys/route.ts"), "utf8");
test("eligibility derives from the SHARED surveyAnalysisEligibility predicate (not a re-implemented ≥30)", () => {
  assert.match(surveysRoute, /surveyAnalysisEligibility/);
  assert.match(surveysRoute, /analysis_eligible/);
  assert.match(surveysRoute, /analysis_reason/);
});
test("eligibility is BATCHED (answers read only for thin surveys) — no per-survey resolver / N+1", () => {
  assert.match(surveysRoute, /thinIds/);                               // only sub-gate surveys need the answer read
  assert.match(surveysRoute, /response_answers/);                      // one batched read
  assert.doesNotMatch(surveysRoute, /resolveSurveyAnalysisEligibility/); // NOT the per-survey resolver in a loop
});
