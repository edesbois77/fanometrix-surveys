import { test } from "node:test";
import assert from "node:assert/strict";
import {
  plannedProgress,
  surveyLifecycleState,
  mapFunnelCounts,
  funnelStages,
  relativeResponseLabel,
  canManageSurvey,
  isRealSurvey,
} from "./collection-health";

// ── Target / progress (Phase 3, cases A–E) ───────────────────────────────────

test("5. all campaigns targeted → planned progress over the full target", () => {
  const p = plannedProgress([
    { target_responses: 300, response_count: 210 },
    { target_responses: 200, response_count: 90 },
  ]);
  assert.equal(p.hasTarget, true);
  assert.equal(p.targetTotal, 500);
  assert.equal(p.completedTowardTarget, 300);
  assert.equal(p.untargetedResponses, 0);
  assert.equal(p.progressRatio, 0.6);
  assert.equal(p.targetReached, false);
});

test("6. mixed targeted/untargeted → denominator is the targeted subset only", () => {
  const p = plannedProgress([
    { target_responses: 500, response_count: 250 }, // targeted
    { target_responses: null, response_count: 120 }, // untargeted (open)
  ]);
  assert.equal(p.targetTotal, 500);
  assert.equal(p.completedTowardTarget, 250);
  assert.equal(p.untargetedResponses, 120);        // shown separately, never in the denominator
  assert.equal(p.progressRatio, 0.5);
  assert.equal(p.totalResponses, 370);
});

test("7. no campaign targeted → no ratio (no bar), just a response count", () => {
  const p = plannedProgress([
    { target_responses: null, response_count: 40 },
    { target_responses: null, response_count: 60 },
  ]);
  assert.equal(p.hasTarget, false);
  assert.equal(p.progressRatio, null);
  assert.equal(p.targetReached, false);
  assert.equal(p.totalResponses, 100);
});

test("8. continue-mode overachievement exceeds 100% (never clamped)", () => {
  const p = plannedProgress([{ target_responses: 100, response_count: 180 }]);
  assert.equal(p.progressRatio, 1.8);
  assert.equal(p.targetReached, true);
});

test("9. stop-mode target reached", () => {
  const p = plannedProgress([{ target_responses: 500, response_count: 500 }]);
  assert.equal(p.progressRatio, 1);
  assert.equal(p.targetReached, true);
});

// ── Lifecycle states (Phase 4 — factual only) ────────────────────────────────

test("lifecycle: draft / scheduled / live / collecting", () => {
  assert.equal(surveyLifecycleState({ effectiveStatuses: [], totalResponses: 0, targetReached: false }), "draft");
  assert.equal(surveyLifecycleState({ effectiveStatuses: ["draft", "draft"], totalResponses: 0, targetReached: false }), "draft");
  assert.equal(surveyLifecycleState({ effectiveStatuses: ["scheduled"], totalResponses: 0, targetReached: false }), "scheduled");
  assert.equal(surveyLifecycleState({ effectiveStatuses: ["live"], totalResponses: 0, targetReached: false }), "live");
  assert.equal(surveyLifecycleState({ effectiveStatuses: ["live", "closed"], totalResponses: 5, targetReached: false }), "collecting");
});

test("lifecycle: continue-mode past goal stays collecting; stop-mode ceiling reads target_reached", () => {
  // continue: campaigns still live even though targetReached → collecting (not terminal).
  assert.equal(surveyLifecycleState({ effectiveStatuses: ["live"], totalResponses: 600, targetReached: true }), "collecting");
  // stop: ceiling auto-closes campaigns, so none are live → target_reached.
  assert.equal(surveyLifecycleState({ effectiveStatuses: ["closed"], totalResponses: 500, targetReached: true }), "target_reached");
  // fully closed, no target → closed.
  assert.equal(surveyLifecycleState({ effectiveStatuses: ["closed", "archived"], totalResponses: 300, targetReached: false }), "closed");
});

// ── Funnel canonical event types (Phase 6 / test 12) ─────────────────────────

test("12. funnel maps ONLY canonical event types (never q1/q2/q3)", () => {
  const f = mapFunnelCounts([
    { event_type: "SURVEY_RENDER", event_count: 1000 },
    { event_type: "SURVEY_VISIBLE", event_count: 450 },
    { event_type: "SURVEY_START", event_count: 60 },
    { event_type: "SURVEY_COMPLETED", event_count: 24 },
    { event_type: "QUESTION_2_REACHED", event_count: 55 }, // ignored — not a funnel stage here
    { event_type: "SURVEY_EXIT", event_count: 3 },          // deprecated — ignored
  ]);
  assert.deepEqual(f, { loads: 1000, viewable: 450, started: 60, completed: 24 });
  const stages = funnelStages(f);
  assert.deepEqual(stages.map((s) => s.key), ["loads", "viewable", "started", "completed"]);
  assert.equal(stages[1].ofLoads, 0.45);
  assert.equal(stages[3].ofLoads, 0.024);
});

test("funnel handles zero loads without dividing by zero", () => {
  const stages = funnelStages(mapFunnelCounts([]));
  assert.equal(stages[0].ofLoads, null);
  assert.equal(stages[3].ofLoads, null);
});

// ── Question-count agnosticism (tests 10 & 11) ───────────────────────────────

test("10 & 11. operational metrics are identical for 1-question and 5-question surveys", () => {
  // Full-survey completion is SURVEY_COMPLETED — the funnel/progress never read
  // question structure, so a 1-q and a 5-q survey with the same campaign data
  // produce the same operational result.
  const oneQ = mapFunnelCounts([{ event_type: "SURVEY_RENDER", event_count: 100 }, { event_type: "SURVEY_COMPLETED", event_count: 10 }]);
  const fiveQ = mapFunnelCounts([{ event_type: "SURVEY_RENDER", event_count: 100 }, { event_type: "SURVEY_COMPLETED", event_count: 10 }, { event_type: "QUESTION_5_REACHED", event_count: 12 }]);
  assert.deepEqual(oneQ, fiveQ);
  const prog = plannedProgress([{ target_responses: 100, response_count: 10 }]);
  assert.equal(prog.progressRatio, 0.1); // unaffected by question count
});

// ── Access (OPERATIONAL OWNERSHIP, not data entitlement) — tests 1–4 ─────────

test("1 & 2. Home/Manage survey visibility is by ownership; cross-org guessing fails", () => {
  const survey = { organisation_id: "org-a" };
  assert.equal(canManageSurvey({ role: "publisher", organisationId: "org-a" }, survey), true);
  assert.equal(canManageSurvey({ role: "publisher", organisationId: "org-b" }, survey), false); // cross-org
  assert.equal(canManageSurvey({ role: "publisher", organisationId: null }, survey), false);
});

test("3 & 4. Manage is NOT broadened by data entitlement; distributor/admin", () => {
  const survey = { organisation_id: "org-fanometrix" }; // commissioned survey, operated by Fanometrix
  // A commissioning/distribution org that merely has data entitlement or is the
  // publisher_org_id is NOT the owner → no Manage/Home operational access.
  assert.equal(canManageSurvey({ role: "publisher", organisationId: "org-dentsu" }, survey), false); // data-entitled client
  assert.equal(canManageSurvey({ role: "publisher", organisationId: "org-livescore" }, survey), false); // distribution publisher
  assert.equal(canManageSurvey({ role: "admin", organisationId: null }, survey), true); // operator/governed path
});

// ── Demo/simulated exclusion (test 13) ───────────────────────────────────────

test("13. simulated surveys are excluded from operational surfaces", () => {
  assert.equal(isRealSurvey({ is_simulated: false }), true);
  assert.equal(isRealSurvey({}), true);
  assert.equal(isRealSurvey({ is_simulated: true }), false);
});

// ── Factual recency ──────────────────────────────────────────────────────────

test("relativeResponseLabel is factual and null-safe", () => {
  const now = Date.parse("2026-08-13T12:00:00Z");
  assert.equal(relativeResponseLabel("2026-08-13T09:00:00Z", now), "3 hours ago");
  assert.equal(relativeResponseLabel("2026-08-13T11:59:30Z", now), "just now");
  assert.equal(relativeResponseLabel(null, now), null);
  assert.equal(relativeResponseLabel("not-a-date", now), null);
});
