import { test } from "node:test";
import assert from "node:assert/strict";
import { validateStudyDraft, canCreateStudy, STUDY_MIN_SURVEYS } from "./user-study";

const AUTH = ["A", "B", "C"]; // the caller's authorised survey universe

test("a valid draft passes and returns the trimmed name + surveys", () => {
  const r = validateStudyDraft("  My Study  ", ["A", "B"], AUTH);
  assert.deepEqual(r, { ok: true, name: "My Study", surveyIds: ["A", "B"] });
});

test("an empty / whitespace name is rejected", () => {
  assert.equal(validateStudyDraft("", ["A", "B"], AUTH).ok, false);
  assert.equal(validateStudyDraft("   ", ["A", "B"], AUTH).ok, false);
  assert.equal(validateStudyDraft(null, ["A", "B"], AUTH).ok, false);
});

test("fewer than the minimum number of surveys is rejected", () => {
  const r = validateStudyDraft("S", ["A"], AUTH);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, new RegExp(`at least ${STUDY_MIN_SURVEYS}`));
});

test("SECURITY: any survey id outside the authorised universe fails the whole request closed", () => {
  // 'Z' is not authorised — the request is rejected, never silently dropped/saved.
  const r = validateStudyDraft("S", ["A", "Z"], AUTH);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /aren't available/);
});

test("SECURITY: a browser-submitted unauthorised-only selection cannot create a study", () => {
  assert.equal(validateStudyDraft("S", ["X", "Y"], AUTH).ok, false);
  assert.equal(validateStudyDraft("S", ["A", "B"], []).ok, false); // empty authorised universe
});

test("duplicate ids are de-duplicated before the minimum check", () => {
  // ["A","A"] collapses to one → below minimum.
  assert.equal(validateStudyDraft("S", ["A", "A"], AUTH).ok, false);
  const r = validateStudyDraft("S", ["A", "A", "B"], AUTH);
  assert.deepEqual(r.ok && r.surveyIds, ["A", "B"]);
});

test("non-string / malformed survey ids are ignored (then fail the minimum)", () => {
  const r = validateStudyDraft("S", ["A", 42, null, "  "], AUTH as string[]);
  assert.equal(r.ok, false); // only 'A' survives → below minimum
});

test("an over-long name is rejected", () => {
  assert.equal(validateStudyDraft("x".repeat(200), ["A", "B"], AUTH).ok, false);
});

test("canCreateStudy needs at least the minimum eligible surveys", () => {
  assert.equal(canCreateStudy(0), false);
  assert.equal(canCreateStudy(1), false);
  assert.equal(canCreateStudy(2), true);
  assert.equal(canCreateStudy(50), true);
});
