import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateDocumentReadAccess,
  documentVisibleToViewer,
  GOVERNANCE_DEFAULTS,
  type GovernedDocument,
} from "./governance";

const ORG_A = "org-A";
const ORG_B = "org-B";

// A confidential document owned by org A (trust-first defaults: internal/confidential-ish).
const orgAConfidential: GovernedDocument = {
  ...GOVERNANCE_DEFAULTS,
  owner: "organisation",
  owner_org_id: ORG_A,
  confidentiality: "confidential",
  visibility: "organisation",
};

const platformDoc: GovernedDocument = {
  ...GOVERNANCE_DEFAULTS,
  owner: "public",
  owner_org_id: null,
  confidentiality: "public",
  visibility: "platform",
};

const internalFanometrixDoc: GovernedDocument = { ...GOVERNANCE_DEFAULTS }; // internal/internal, owner null

// ── documentVisibleToViewer (the org/confidentiality/visibility gate) ─────────

test("own-organisation viewer can see their org's confidential document", () => {
  assert.equal(documentVisibleToViewer(orgAConfidential, ORG_A), true);
});

test("other-organisation viewer cannot see an org's confidential document", () => {
  assert.equal(documentVisibleToViewer(orgAConfidential, ORG_B), false);
});

test("platform/public document is visible to any organisation", () => {
  assert.equal(documentVisibleToViewer(platformDoc, ORG_B), true);
});

test("internal Fanometrix document is not visible to an ordinary organisation", () => {
  assert.equal(documentVisibleToViewer(internalFanometrixDoc, ORG_B), false);
});

test("operator (admin) sees everything", () => {
  assert.equal(documentVisibleToViewer(orgAConfidential, "operator"), true);
});

// ── evaluateDocumentReadAccess (F041 direct GET-by-id authorisation) ──────────

test("authorised: admin can read any document by id", () => {
  assert.equal(evaluateDocumentReadAccess(true, orgAConfidential, ORG_B, false), true);
});

test("authorised: own-organisation user reads their org's document", () => {
  assert.equal(evaluateDocumentReadAccess(false, orgAConfidential, ORG_A, false), true);
});

test("refused: other-organisation user, confidentiality/visibility forbids, not attached", () => {
  assert.equal(evaluateDocumentReadAccess(false, orgAConfidential, ORG_B, false), false);
});

test("refused: cross-organisation document id with a leaked/known UUID alone is insufficient", () => {
  // The caller has a valid session + a valid document UUID but no legitimate basis.
  assert.equal(evaluateDocumentReadAccess(false, orgAConfidential, ORG_B, false), false);
});

test("authorised: document is attached to a Research Project the viewer can access", () => {
  assert.equal(evaluateDocumentReadAccess(false, orgAConfidential, ORG_B, true), true);
});

test("refused: user with no organisation and no project attachment", () => {
  assert.equal(evaluateDocumentReadAccess(false, orgAConfidential, null, false), false);
});

test("authorised: platform/public document readable without org match or attachment", () => {
  assert.equal(evaluateDocumentReadAccess(false, platformDoc, ORG_B, false), true);
});
