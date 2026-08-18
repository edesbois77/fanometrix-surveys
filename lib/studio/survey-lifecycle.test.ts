import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveLifecycle,
  researchDefinitionLocked,
  researchDefinitionSignature,
  researchDefinitionEditBlocked,
  restoreTargetStatus,
  restoreAllowed,
  surveyActions,
  surveyListActions,
  type SurveyActionInput,
} from "./survey-lifecycle";

// A FedEx-style question (multilingual), matching the real jsonb shape.
const q1 = {
  id: "q1", text: { en: "How do you rate FedEx as a Champions League sponsor?", de: "Wie bewerten Sie FedEx?" },
  options: [
    { id: 1, text: { en: "Strong natural fit", de: "Starke Passung" } },
    { id: 2, text: { en: "Never noticed them", de: "Nie bemerkt" } },
  ],
};
const langs = ["en", "de"];

// ── effectiveLifecycle ────────────────────────────────────────────────────────
test("effectiveLifecycle: persisted archived/deleted win over campaign state", () => {
  assert.equal(effectiveLifecycle({ persistedStatus: "archived", operationalLifecycle: "live", hasLiveCampaign: true, hasEvidence: true }), "archived");
  assert.equal(effectiveLifecycle({ persistedStatus: "deleted", operationalLifecycle: "closed", hasLiveCampaign: false, hasEvidence: true }), "deleted");
});
test("effectiveLifecycle: operational activity is surfaced when not archived/deleted", () => {
  assert.equal(effectiveLifecycle({ persistedStatus: "ready", operationalLifecycle: "collecting", hasLiveCampaign: true, hasEvidence: true }), "collecting");
  assert.equal(effectiveLifecycle({ persistedStatus: "ready", operationalLifecycle: "closed", hasLiveCampaign: false, hasEvidence: true }), "closed");
});
test("effectiveLifecycle: draft vs ready when operationally idle", () => {
  assert.equal(effectiveLifecycle({ persistedStatus: "ready", operationalLifecycle: "draft", hasLiveCampaign: false, hasEvidence: false }), "ready");
  assert.equal(effectiveLifecycle({ persistedStatus: "draft", operationalLifecycle: "draft", hasLiveCampaign: false, hasEvidence: false }), "draft");
});

// ── Research-definition lock triggers ─────────────────────────────────────────
test("locked by evidence OR by live campaign (not only response count)", () => {
  assert.equal(researchDefinitionLocked({ hasEvidence: true, hasLiveCampaign: false }), true);
  assert.equal(researchDefinitionLocked({ hasEvidence: false, hasLiveCampaign: true }), true); // the closed hole
  assert.equal(researchDefinitionLocked({ hasEvidence: false, hasLiveCampaign: false }), false);
});

// ── Research-definition signature — the semantic protections ──────────────────
test("wording change (any language) changes the signature", () => {
  const a = researchDefinitionSignature([q1], langs);
  const reworded = { ...q1, text: { en: "A completely different question?", de: q1.text.de } };
  assert.notEqual(a, researchDefinitionSignature([reworded], langs));
  const rewordedDe = { ...q1, text: { en: q1.text.en, de: "Ganz andere Frage?" } };
  assert.notEqual(a, researchDefinitionSignature([rewordedDe], langs));
});
test("option-label change changes the signature", () => {
  const a = researchDefinitionSignature([q1], langs);
  const relabelled = { ...q1, options: [{ id: 1, text: { en: "TOTALLY DIFFERENT", de: "Starke Passung" } }, q1.options[1]] };
  assert.notEqual(a, researchDefinitionSignature([relabelled], langs));
});
test("type / order / add / remove all change the signature", () => {
  const a = researchDefinitionSignature([q1], langs);
  assert.notEqual(a, researchDefinitionSignature([{ ...q1, type: "multi" }], langs));                 // type
  assert.notEqual(a, researchDefinitionSignature([{ ...q1, options: [q1.options[1], q1.options[0]] }], langs)); // option order
  assert.notEqual(a, researchDefinitionSignature([q1, { ...q1, id: "q2" }], langs));                  // add question
  assert.notEqual(a, researchDefinitionSignature([], langs));                                          // remove question
});
test("language-set change changes the signature", () => {
  assert.notEqual(researchDefinitionSignature([q1], ["en", "de"]), researchDefinitionSignature([q1], ["en"]));
});
test("identical definition (incl. reordered language keys) is stable", () => {
  const reorderedLangKeys = { ...q1, text: { de: q1.text.de, en: q1.text.en } };
  assert.equal(researchDefinitionSignature([q1], langs), researchDefinitionSignature([reorderedLangKeys], ["de", "en"]));
});

// ── Edit-blocking gate ────────────────────────────────────────────────────────
test("unlocked survey: any research edit allowed", () => {
  assert.equal(researchDefinitionEditBlocked({ locked: false, storedQuestions: [q1], storedLanguages: langs, incomingQuestions: [], incomingLanguages: [] }), false);
});
test("locked survey: wording-only edit is blocked", () => {
  const reworded = { ...q1, text: { en: "Different?", de: q1.text.de } };
  assert.equal(researchDefinitionEditBlocked({ locked: true, storedQuestions: [q1], storedLanguages: langs, incomingQuestions: [reworded], incomingLanguages: langs }), true);
});
test("locked survey: option-label-only edit is blocked", () => {
  const relabelled = { ...q1, options: [{ id: 1, text: { en: "X", de: "Y" } }, q1.options[1]] };
  assert.equal(researchDefinitionEditBlocked({ locked: true, storedQuestions: [q1], storedLanguages: langs, incomingQuestions: [relabelled], incomingLanguages: langs }), true);
});
test("locked survey: unchanged research definition is allowed (metadata-only save)", () => {
  assert.equal(researchDefinitionEditBlocked({ locked: true, storedQuestions: [q1], storedLanguages: langs, incomingQuestions: [q1], incomingLanguages: langs }), false);
});

// ── Restore target ────────────────────────────────────────────────────────────
test("restore target: evidence → ready, none → draft", () => {
  assert.equal(restoreTargetStatus({ hasEvidence: true }), "ready");
  assert.equal(restoreTargetStatus({ hasEvidence: false }), "draft");
});

// ── Action matrix ─────────────────────────────────────────────────────────────
const base: SurveyActionInput = {
  effective: "draft", hasLiveCampaign: false, hasEvidence: false, canManage: true, isAdmin: false, deletable: true,
};
test("draft no-data: edit everything, delete allowed, no archive block", () => {
  const a = surveyActions(base);
  assert.equal(a.canEditResearchDefinition, true);
  assert.equal(a.researchLocked, false);
  assert.equal(a.canDelete, true);
  assert.equal(a.canArchive, true);
});
test("live survey: research locked, archive blocked, delete blocked (live reason)", () => {
  const a = surveyActions({ ...base, effective: "live", hasLiveCampaign: true, deletable: false });
  assert.equal(a.canEditResearchDefinition, false);
  assert.equal(a.canArchive, false);
  assert.match(a.archiveBlockedReason ?? "", /Stop collection/);
  assert.equal(a.canDelete, false);
  assert.match(a.deleteBlockedReason ?? "", /Stop collection/);
});
test("historical (has data, not live): locked, archive allowed, delete blocked (data reason)", () => {
  const a = surveyActions({ ...base, effective: "closed", hasEvidence: true, deletable: false });
  assert.equal(a.canEditResearchDefinition, false);
  assert.equal(a.canEditMetadata, true);
  assert.equal(a.canArchive, true);
  assert.equal(a.canDelete, false);
  assert.match(a.deleteBlockedReason ?? "", /Archive it instead/);
});
test("archived: restore available, no archive/delete", () => {
  const a = surveyActions({ ...base, effective: "archived", hasEvidence: true });
  assert.equal(a.canRestore, true);
  assert.equal(a.canArchive, false);
  assert.equal(a.canDelete, false);
});
// ── Restore authority (admin-recovery boundary) ──────────────────────────────
test("restoreAllowed: owner may restore archived; only admin may restore deleted", () => {
  assert.equal(restoreAllowed({ wasDeleted: false, isAdmin: false }), true);  // archived → owner ok
  assert.equal(restoreAllowed({ wasDeleted: false, isAdmin: true }), true);
  assert.equal(restoreAllowed({ wasDeleted: true, isAdmin: false }), false);  // deleted → normal user blocked
  assert.equal(restoreAllowed({ wasDeleted: true, isAdmin: true }), true);    // deleted → admin recovery
});

test("non-manager: no mutating actions", () => {
  const a = surveyActions({ ...base, canManage: false });
  assert.equal(a.canEditMetadata, false);
  assert.equal(a.canEditResearchDefinition, false);
  assert.equal(a.canArchive, false);
  assert.equal(a.canDelete, false);
  assert.equal(a.canRestore, false);
});

// ── Manage → Surveys list quick actions (authoritative analysis eligibility) ──
const sig = (over: Partial<import("./survey-lifecycle").SurveyListSignals>): import("./survey-lifecycle").SurveyListSignals =>
  ({ status: "ready", liveCampaignCount: 0, responseCount: 0, analysisEligible: false, hasAnalysis: false, ...over });

test("list: empty untouched Draft → Edit primary (NO Analyse), Delete in overflow", () => {
  const a = surveyListActions(sig({ status: "draft" }));
  assert.equal(a.primary, "edit");
  assert.equal(a.primaryDisabled, false);
  assert.ok(a.overflow.includes("delete"));
});
test("list: collecting but BELOW the authoritative gate → Analyse shown DISABLED (teaches)", () => {
  const a = surveyListActions(sig({ responseCount: 12, analysisEligible: false }));
  assert.equal(a.primary, "analyse");
  assert.equal(a.primaryDisabled, true);           // ← not enabled; response_count > 0 does NOT enable Analyse
  assert.ok(!a.overflow.includes("delete"));
});
test("list: eligible, no analysis → Analyse ENABLED", () => {
  const a = surveyListActions(sig({ responseCount: 274, analysisEligible: true }));
  assert.equal(a.primary, "analyse");
  assert.equal(a.primaryDisabled, false);
  assert.ok(a.overflow.includes("archive") && !a.overflow.includes("delete"));
});
test("list: eligible + completed analysis → View findings primary, Regenerate in overflow", () => {
  const a = surveyListActions(sig({ responseCount: 274, analysisEligible: true, hasAnalysis: true }));
  assert.equal(a.primary, "view-findings");
  assert.ok(a.overflow.includes("regenerate"));
  assert.ok(!a.overflow.includes("delete"));
});
test("list: live BELOW gate → Analyse disabled; live ELIGIBLE → Analyse; live + analysis → View findings", () => {
  const below = surveyListActions(sig({ liveCampaignCount: 2, responseCount: 8, analysisEligible: false }));
  assert.equal(below.primary, "analyse"); assert.equal(below.primaryDisabled, true);
  const elig = surveyListActions(sig({ liveCampaignCount: 2, responseCount: 120, analysisEligible: true }));
  assert.equal(elig.primary, "analyse"); assert.equal(elig.primaryDisabled, false);
  const withAi = surveyListActions(sig({ liveCampaignCount: 2, responseCount: 120, analysisEligible: true, hasAnalysis: true }));
  assert.equal(withAi.primary, "view-findings");
  assert.ok(withAi.overflow.includes("regenerate"));
  for (const a of [below, elig, withAi]) assert.ok(!a.overflow.includes("delete") && !a.overflow.includes("archive"));
});
test("list: archived → Restore primary regardless of analysis", () => {
  assert.equal(surveyListActions(sig({ status: "archived", responseCount: 274, analysisEligible: true, hasAnalysis: true })).primary, "restore");
});
test("list: FedEx-style data-bearing survey never surfaces a usable Delete", () => {
  for (const hasAnalysis of [false, true]) {
    const a = surveyListActions(sig({ responseCount: 196, analysisEligible: true, hasAnalysis }));
    assert.ok(a.primary !== "delete" && !a.overflow.includes("delete"));
  }
});
test("list eligibility uses the SAME predicate as detail (no response_count>0 proxy)", async () => {
  const { surveyAnalysisEligibility, ANALYSIS_MIN_BASE } = await import("./survey-analysis-evidence");
  // The shared rule: eligible ⟺ max answered base ≥ ANALYSIS_MIN_BASE.
  assert.equal(surveyAnalysisEligibility(ANALYSIS_MIN_BASE).eligible, true);
  assert.equal(surveyAnalysisEligibility(ANALYSIS_MIN_BASE - 1).eligible, false);
  assert.equal(surveyAnalysisEligibility(1).eligible, false);   // response_count > 0 does NOT imply eligible
  assert.match(surveyAnalysisEligibility(5).reason ?? "", /at least 30 answers/);
});
