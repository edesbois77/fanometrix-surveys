import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Structural guarantees for the Discover IA refactor. These assert on component
// source (the repo's established UX-contract test pattern) so the tab sets, the
// generate-permission gate and the "no model on render" invariant can't silently
// regress. Behavioural engine/nav/breadcrumb coverage lives in their own suites.

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(HERE, rel), "utf8");
const appDir = join(HERE, "..", "..", ".."); // discover → studio → components → app

const surveyShell = read("SurveyDashboardShell.tsx");
const studyShell = read("StudyDashboard.tsx");
const findingsView = read("SurveyFindingsView.tsx");
const findingsRoute = readFileSync(
  join(appDir, "api/survey-studio/discover/dashboards/[surveyId]/findings/route.ts"),
  "utf8",
);

test("Survey detail tabs are exactly Dashboard | Results | Findings | Campaigns", () => {
  // Tab entries are the `{ key: "…", label: "…" }` pairs (scoped so status-badge
  // labels elsewhere in the shell don't leak into the set).
  const labels = [...surveyShell.matchAll(/key:\s*"[^"]+",\s*label:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Dashboard", "Results", "Findings", "Campaigns"]);
  // Performance was renamed to Dashboard; the URL key "performance" is retained so
  // existing ?view= deep links keep working (the analytics are unchanged).
  assert.ok(!/label:\s*"Performance"/.test(surveyShell), "no 'Performance' tab label");
  assert.match(surveyShell, /key:\s*"performance",\s*label:\s*"Dashboard"/);
});

test("Study detail tabs lead with Dashboard (renamed from Overview); Surveys/Results always present", () => {
  assert.match(studyShell, /key:\s*"overview",\s*label:\s*"Dashboard"/); // was "Overview"
  assert.ok(!/label:\s*"Overview"/.test(studyShell), "no 'Overview' tab label");
  for (const l of ["Dashboard", "Surveys", "Publishers", "Markets", "Results"]) {
    assert.ok(studyShell.includes(`label: "${l}"`), `Study tab '${l}' present`);
  }
});

test("Findings route computes canGenerate from the authoritative permission + eligibility rules", () => {
  // Single source of truth: canManageSurvey (owner/admin) AND the shared eligibility
  // predicate AND no existing analysis. No second permission or eligibility system.
  assert.match(findingsRoute, /import \{ canManageSurvey \} from "@\/lib\/studio\/collection-health"/);
  assert.match(findingsRoute, /surveyAnalysisEligibility/);
  assert.match(
    findingsRoute,
    /canGenerate\s*=\s*analysisEligible\s*&&\s*analysis == null\s*&&\s*canManageSurvey\(/,
  );
});

test("Discover render never invokes the model — the findings GET only READS analysis", () => {
  // The read path must not import or call the generation entrypoint (analyseSurvey);
  // it only reads a completed run via getCurrentSurveyAnalysis.
  assert.ok(!/analyseSurvey/.test(findingsRoute), "findings route must not call the generator");
  assert.match(findingsRoute, /getCurrentSurveyAnalysis/);
  assert.match(findingsRoute, /No model is invoked here|no model is invoked here/);
});

test("Generation is a user action via the governed endpoint — never an effect on render", () => {
  // generateAnalysis POSTs to the governed /analysis endpoint and is wired ONLY to the
  // Findings CTA (onAnalyse). It must not run inside a useEffect (no auto-invoke).
  assert.match(surveyShell, /fetch\(`\/api\/studio\/surveys\/\$\{encodeURIComponent\(surveyId\)\}\/analysis`,\s*\{\s*method:\s*"POST"/);
  assert.match(surveyShell, /onAnalyse=\{generateAnalysis\}/);
  const effects = [...surveyShell.matchAll(/useEffect\([\s\S]*?\)/g)].map((m) => m[0]);
  for (const e of effects) assert.ok(!/generateAnalysis|\/analysis`/.test(e), "no analysis call in a useEffect");
});

test("The Analyse CTA is shown ONLY when the caller canGenerate", () => {
  // Every AnalyseOpportunity render site is guarded by canGenerate; read-only callers
  // (brand/agency) get no CTA. This is a governance FACT, not a permission widening.
  const ctaSites = [...findingsView.matchAll(/<AnalyseOpportunity[^/]*\/>/g)];
  assert.ok(ctaSites.length >= 1, "CTA is rendered somewhere");
  for (const site of findingsView.split("\n").filter((l) => l.includes("<AnalyseOpportunity"))) {
    assert.match(site, /canGenerate && <AnalyseOpportunity/);
  }
});
