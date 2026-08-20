import { test } from "node:test";
import assert from "node:assert/strict";
import { ownsSurvey } from "./embed-preview-auth";
import type { AuthedUser } from "./auth-server";

// `?preview=1` bypasses the validation and effective-status gates so authors can
// see DRAFT surveys. Before this, that bypass was anonymous — every unpublished
// research instrument was readable by anyone holding a UUID or campaign slug.
// Ownership is re-read server-side and never taken from the request.

const ORG   = "aaaaaaaa-1111-2222-3333-444444444444";
const OTHER = "bbbbbbbb-5555-6666-7777-888888888888";

const session = (role: string, organisationId: string | null): AuthedUser =>
  ({ role, organisationId } as AuthedUser);

const survey = (o: Partial<Record<"organisation_id" | "brand_org_id" | "agency_org_id", string | null>>) =>
  ({ organisation_id: null, brand_org_id: null, agency_org_id: null, ...o });

test("the owning organisation may preview its own draft", () => {
  assert.equal(ownsSurvey(session("publisher", ORG), survey({ organisation_id: ORG })), true);
});

test("the brand and agency on a survey may preview it", () => {
  assert.equal(ownsSurvey(session("brand",  ORG), survey({ brand_org_id:  ORG })), true);
  assert.equal(ownsSurvey(session("agency", ORG), survey({ agency_org_id: ORG })), true);
});

test("another organisation may NOT preview it", () => {
  assert.equal(ownsSurvey(session("publisher", OTHER), survey({ organisation_id: ORG })), false);
});

test("a platform admin may preview any survey", () => {
  assert.equal(ownsSurvey(session("admin", OTHER), survey({ organisation_id: ORG })), true);
  assert.equal(ownsSurvey(session("admin", null),  survey({})), true);
});

test("a session with no active organisation is refused", () => {
  assert.equal(ownsSurvey(session("publisher", null), survey({ organisation_id: ORG })), false);
});

test("a missing survey row fails CLOSED", () => {
  assert.equal(ownsSurvey(session("publisher", ORG), null), false);
});

test("null org columns never match a null session org", () => {
  // Regression guard: `null === null` would grant access to every orphan survey.
  assert.equal(ownsSurvey(session("publisher", null), survey({})), false);
});
