import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRequestRecord,
  validateRequestRecord,
  sanitiseMarkets,
  commissionedAttributionFor,
  composeAdditionalContext,
  requestVisibleTo,
  handoffEligibility,
  buildSurveyFromRequest,
  buildRequestNotificationEmail,
  requesterDisplayName,
  isRequestStatus,
  isDirectlyPatchableStatus,
  validateClarificationMessage,
  buildClarificationEmail,
  buildClarificationPatch,
  firstNameOf,
  COMMISSIONED_PURPOSE,
  OTHER_ORG_VALUE,
  type RequesterIdentity,
  type RequestForHandoff,
} from "./research-request";

const REQUESTER: RequesterIdentity = {
  organisationId: "org-pub",
  organisationName: "The Football Collective",
  workEmail: "sam@publisher.example",
  firstName: "Sam",
  lastName: "Rivers",
};

// ── 1. Request no longer takes a Purpose — it is always commissioned ─────────
test("purpose is forced to commissioned regardless of any body value", () => {
  const rec = buildRequestRecord(
    // even a hostile body cannot downgrade the purpose
    { name: "n", objective: "o", purpose: "editorial_audience" } as Record<string, unknown>,
    REQUESTER,
  );
  assert.equal(rec!.purpose, COMMISSIONED_PURPOSE);
  assert.equal(COMMISSIONED_PURPOSE, "third_party");
});

// ── 2. Persisted Request still records the commissioned purpose ──────────────
test("a submitted record records the commissioned purpose", () => {
  const rec = buildRequestRecord({ name: "Sponsor lift", objective: "Measure awareness" }, REQUESTER);
  assert.ok(rec);
  assert.equal(rec!.status, "submitted");
  assert.equal(rec!.purpose, "third_party");
  assert.deepEqual(validateRequestRecord(rec!), []);
});

test("name and objective remain required", () => {
  const rec = buildRequestRecord({ markets: ["GB"] }, REQUESTER);
  assert.equal(validateRequestRecord(rec!).length, 2);
});

// ── 3. Accepted → Create seeds the commissioned purpose automatically ────────
test("hand-off seeds the survey with the commissioned purpose", () => {
  const row: RequestForHandoff = {
    id: "r", status: "accepted", survey_id: null, organisation_id: "org-pub",
    name: "Sponsor lift study", objective: "Measure awareness", audience: "PL followers",
    markets: ["GB"], brand_org_id: "brand-nike", agency_org_id: null,
  };
  const seed = buildSurveyFromRequest(row) as { about: Record<string, unknown> };
  assert.equal(seed.about.purpose, "third_party");
});

// ── 4. Governed markets persist ──────────────────────────────────────────────
test("governed markets are kept, de-duplicated, in canonical order", () => {
  assert.deepEqual(sanitiseMarkets(["US", "GB", "GB", "ZZ"]), ["GB", "US"]);
  const rec = buildRequestRecord({ name: "n", objective: "o", markets: ["GB", "FAKE", "DE"] }, REQUESTER);
  assert.deepEqual(rec!.markets, ["GB", "DE"]);
});

// ── 5. Other market can be supplied (as briefing context) ────────────────────
test("Other market text is folded into additional_context, labelled", () => {
  const rec = buildRequestRecord(
    { name: "n", objective: "o", markets: ["GB"], otherMarkets: "Saudi Arabia, UAE", additionalContext: "Sponsor is regional." },
    REQUESTER,
  );
  assert.match(rec!.additional_context ?? "", /Requested market\(s\) not in our list: Saudi Arabia, UAE/);
  assert.match(rec!.additional_context ?? "", /Sponsor is regional\./);
  // composeAdditionalContext is order-stable: other markets first, then context.
  assert.equal(
    composeAdditionalContext("Sponsor is regional.", "Saudi Arabia"),
    "Requested market(s) not in our list: Saudi Arabia\n\nSponsor is regional.",
  );
  assert.equal(composeAdditionalContext(null, null), null);
});

// ── 6. Other market does NOT become a governed / survey market ───────────────
test("Other market text never becomes a governed market", () => {
  const rec = buildRequestRecord({ name: "n", objective: "o", markets: ["GB"], otherMarkets: "Saudi Arabia" }, REQUESTER);
  assert.deepEqual(rec!.markets, ["GB"]); // Saudi Arabia is not a governed code
  // And the hand-off only transfers governed markets.
  const row: RequestForHandoff = {
    id: "r", status: "accepted", survey_id: null, organisation_id: "o",
    name: "n", objective: "o", audience: null, markets: ["GB", "not-a-code"], brand_org_id: null, agency_org_id: null,
  };
  const seed = buildSurveyFromRequest(row) as { about: { markets: string[] } };
  assert.deepEqual(seed.about.markets, ["GB"]);
});

// ── 7 & 8. Brand / Agency governed ids persist ───────────────────────────────
test("governed Brand and Agency ids persist", () => {
  const rec = buildRequestRecord(
    { name: "n", objective: "o", brandOrgId: "brand-nike", agencyOrgId: "agency-x" },
    REQUESTER,
  );
  assert.equal(rec!.brand_org_id, "brand-nike");
  assert.equal(rec!.agency_org_id, "agency-x");
});

// ── 9 & 10. "Other / Not listed" stores NO fake org id ───────────────────────
test("Other / Not listed Brand and Agency persist as null, never a fake id", () => {
  const rec = buildRequestRecord(
    { name: "n", objective: "o", brandOrgId: OTHER_ORG_VALUE, agencyOrgId: OTHER_ORG_VALUE },
    REQUESTER,
  );
  assert.equal(rec!.brand_org_id, null);
  assert.equal(rec!.agency_org_id, null);
  // Directly at the rule: sentinel and "" both coerce to null.
  assert.deepEqual(commissionedAttributionFor("third_party", OTHER_ORG_VALUE, ""), { brand_org_id: null, agency_org_id: null });
  assert.deepEqual(commissionedAttributionFor("third_party", "brand-nike", OTHER_ORG_VALUE), { brand_org_id: "brand-nike", agency_org_id: null });
});

// ── 11. Additional context persists missing Brand/Agency details (free text) ─
test("additional context free text persists", () => {
  const rec = buildRequestRecord(
    { name: "n", objective: "o", brandOrgId: OTHER_ORG_VALUE, additionalContext: "Brand is Acme Sports (not listed)." },
    REQUESTER,
  );
  assert.match(rec!.additional_context ?? "", /Acme Sports/);
  assert.equal(rec!.brand_org_id, null);
});

// ── 14. Organisation / requester scoping unchanged ───────────────────────────
test("record is scoped to the requester's Current Organisation and identity", () => {
  const rec = buildRequestRecord({ name: "n", objective: "o" }, REQUESTER);
  assert.equal(rec!.organisation_id, "org-pub");
  assert.equal(rec!.requester_email, "sam@publisher.example");
  assert.equal(rec!.requester_name, "Sam Rivers");
  assert.equal(requesterDisplayName({ firstName: null, lastName: null }), null);
});

test("no current organisation → cannot build a request", () => {
  assert.equal(buildRequestRecord({ name: "n", objective: "o" }, { ...REQUESTER, organisationId: null }), null);
});

test("cross-organisation reads are denied; admin sees all", () => {
  const row = { organisation_id: "org-pub" };
  assert.equal(requestVisibleTo(row, { role: "publisher", organisationId: "org-pub" }), true);
  assert.equal(requestVisibleTo(row, { role: "publisher", organisationId: "org-other" }), false);
  assert.equal(requestVisibleTo(row, { role: "publisher", organisationId: null }), false);
  assert.equal(requestVisibleTo(row, { role: "admin", organisationId: "org-other" }), true);
});

// ── 15. Submission does NOT create Survey/Campaign/Deploy state ──────────────
test("a submitted record carries no survey/campaign/deploy fields", () => {
  const rec = buildRequestRecord({ name: "n", objective: "o", brandOrgId: "brand-nike" }, REQUESTER) as Record<string, unknown>;
  for (const f of ["survey_id", "campaign_id", "campaigns", "creative_design", "questions", "deployed_at"]) {
    assert.equal(f in rec, false, `record must not contain ${f}`);
  }
  assert.equal(rec.status, "submitted");
});

// ── 16. Accepted hand-off transfers only governed compatible fields ──────────
test("hand-off copies only compatible About fields, ids by stable identity", () => {
  const row: RequestForHandoff = {
    id: "r", status: "accepted", survey_id: null, organisation_id: "o",
    name: "Sponsor lift study", objective: "Measure awareness", audience: "PL followers",
    markets: ["GB", "US"], brand_org_id: "brand-nike", agency_org_id: "agency-x",
  };
  const seed = buildSurveyFromRequest(row) as Record<string, unknown>;
  assert.equal(seed.name, "Sponsor lift study");
  assert.equal(seed.status, "draft");
  assert.deepEqual(seed.about, { objective: "Measure awareness", audience: "PL followers", markets: ["GB", "US"], purpose: "third_party" });
  assert.equal(seed.brand_org_id, "brand-nike");
  assert.equal(seed.agency_org_id, "agency-x");
  // Not transferred: desired responses / launch never appear on the survey seed.
  for (const f of ["desired_responses", "desired_launch_date", "additional_context", "requester_email"]) {
    assert.equal(f in seed, false);
  }
});

test("hand-off is refused unless accepted, and never duplicates a survey", () => {
  assert.deepEqual(handoffEligibility({ status: "submitted", survey_id: null }), { ok: false, reason: "not_accepted" });
  assert.deepEqual(handoffEligibility({ status: "accepted", survey_id: null }), { ok: true });
  assert.deepEqual(handoffEligibility({ status: "accepted", survey_id: "survey-1" }), { ok: false, reason: "already_created" });
});

test("hand-off falls back to Untitled survey when the request has no name", () => {
  const row: RequestForHandoff = {
    id: "r", status: "accepted", survey_id: null, organisation_id: "o",
    name: null, objective: "o", audience: null, markets: [], brand_org_id: null, agency_org_id: null,
  };
  assert.equal((buildSurveyFromRequest(row) as { name: string }).name, "Untitled survey");
});

// ── 13. Notification email content includes the actionable brief fields ──────
test("notification email includes the actionable brief fields and Request id", () => {
  const { subject, html, text } = buildRequestNotificationEmail({
    id: "req-123",
    name: "Sponsor lift",
    requesterName: "Sam Rivers",
    requesterEmail: "sam@publisher.example",
    organisationName: "The Football Collective",
    brandName: "Nike",
    agencyName: "Agency X",
    markets: ["GB", "US"],
    otherMarkets: "Saudi Arabia",
    objective: "Measure awareness",
    audience: "PL followers",
    desiredLaunchDate: "2026-09-01",
    desiredResponses: 500,
    additionalContext: "Regional sponsor.",
    link: "https://app.example/survey-studio/manage?view=requests",
  });
  assert.match(subject, /Sponsor lift/);
  for (const needle of ["Sam Rivers", "sam@publisher.example", "The Football Collective", "Nike", "Agency X", "United Kingdom", "United States", "Saudi Arabia", "Measure awareness", "PL followers", "500", "Regional sponsor.", "req-123"]) {
    assert.ok(html.includes(needle), `email html should include "${needle}"`);
  }
  assert.match(text, /Request ID: req-123/);
});

test("notification email omits fields that were not supplied", () => {
  const { html } = buildRequestNotificationEmail({
    id: "r", name: "n", requesterName: null, requesterEmail: "a@b.c", organisationName: null,
    brandName: null, agencyName: null, markets: [], otherMarkets: null, objective: "o",
    audience: null, desiredLaunchDate: null, desiredResponses: null, additionalContext: null,
  });
  assert.equal(html.includes("Agency"), false);
  assert.equal(html.includes("Ideal audience"), false);
});

// ── Clarification workflow ───────────────────────────────────────────────────

// 1. "Needs clarification" is NOT a directly-settable PATCH status — it must go
//    through the clarify workflow. Accept/Decline remain directly settable.
test("needs_clarification is not directly patchable; accept/decline are", () => {
  assert.equal(isDirectlyPatchableStatus("needs_clarification"), false);
  assert.equal(isDirectlyPatchableStatus("submitted"), false);
  assert.equal(isDirectlyPatchableStatus("nonsense"), false);
  assert.equal(isDirectlyPatchableStatus("accepted"), true);
  assert.equal(isDirectlyPatchableStatus("declined"), true);
});

// 2. Empty clarification message is rejected.
test("clarification message must be non-empty", () => {
  assert.match(validateClarificationMessage("") ?? "", /required/);
  assert.match(validateClarificationMessage("   ") ?? "", /required/);
  assert.match(validateClarificationMessage(null) ?? "", /required/);
  assert.equal(validateClarificationMessage("Please clarify the market."), null);
});

// 3 & 4. The email is addressed to the STORED requester email, never client input.
test("clarification email is addressed to the stored requester email", () => {
  const row = { name: "Sponsor lift", requester_name: "Sam Rivers", requester_email: "sam@publisher.example" };
  const email = buildClarificationEmail(row, "Which markets exactly?");
  assert.equal(email.to, "sam@publisher.example"); // comes from the record, not any body
  assert.equal(firstNameOf("Sam Rivers"), "Sam");
  assert.equal(firstNameOf(null), "there");
});

// 5. Email contains the Request name + the admin's message + greeting.
test("clarification email contains request name and the message", () => {
  const row = { name: "Sponsor lift", requester_name: "Sam Rivers", requester_email: "sam@publisher.example" };
  const { subject, html, text } = buildClarificationEmail(row, "Are these UK-only Arsenal fans?");
  assert.match(subject, /More information needed: Sponsor lift/);
  for (const needle of ["Hi Sam", "Sponsor lift", "Are these UK-only Arsenal fans?", "Fanometrix"]) {
    assert.ok(html.includes(needle), `html should include "${needle}"`);
    assert.ok(text.includes(needle), `text should include "${needle}"`);
  }
});

// 6 & 7. The persisted patch flips status AND durably records message/when/who.
test("clarification patch transitions status and records the audit fields", () => {
  const patch = buildClarificationPatch("  Which markets?  ", "ed@fanometrix.example", "2026-08-13T10:00:00.000Z");
  assert.equal(patch.status, "needs_clarification");
  assert.equal(patch.clarification_message, "Which markets?"); // trimmed
  assert.equal(patch.clarification_requested_at, "2026-08-13T10:00:00.000Z");
  assert.equal(patch.clarification_requested_by, "ed@fanometrix.example");
  assert.equal(patch.reviewed_by, "ed@fanometrix.example");
  assert.equal(patch.reviewed_at, "2026-08-13T10:00:00.000Z");
});

// ── Status model guard ───────────────────────────────────────────────────────
test("isRequestStatus accepts only the four V1 statuses", () => {
  for (const s of ["submitted", "accepted", "needs_clarification", "declined"]) assert.equal(isRequestStatus(s), true);
  for (const s of ["draft", "live", "", null, 3]) assert.equal(isRequestStatus(s), false);
});
