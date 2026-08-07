import { test } from "node:test";
import assert from "node:assert/strict";
import {
  campaignOrgsBelongToProject,
  evaluateCampaignProjectAssociation,
  type ProjectOrgs,
  type CampaignOrgFks,
} from "./campaign-project-association";

const PROJECT: ProjectOrgs = { brand_org_id: "brand-1", agency_org_id: "agency-1", publisher_org_ids: ["pub-1", "pub-2"] };

// ── Org-consistency invariant ────────────────────────────────────────────────

test("same-organisation campaign (publisher on the project) is consistent", () => {
  const c: CampaignOrgFks = { publisher_org_id: "pub-1", brand_org_id: "brand-1", agency_org_id: null };
  assert.equal(campaignOrgsBelongToProject(c, PROJECT), true);
});

test("cross-organisation publisher (not on the project) is refused", () => {
  const c: CampaignOrgFks = { publisher_org_id: "pub-X", brand_org_id: null, agency_org_id: null };
  assert.equal(campaignOrgsBelongToProject(c, PROJECT), false);
});

test("cross-organisation brand is refused", () => {
  const c: CampaignOrgFks = { publisher_org_id: "pub-1", brand_org_id: "brand-X", agency_org_id: null };
  assert.equal(campaignOrgsBelongToProject(c, PROJECT), false);
});

test("cross-organisation agency is refused", () => {
  const c: CampaignOrgFks = { publisher_org_id: null, brand_org_id: null, agency_org_id: "agency-X" };
  assert.equal(campaignOrgsBelongToProject(c, PROJECT), false);
});

test("campaign with no org FKs belongs to no organisation → consistent", () => {
  assert.equal(campaignOrgsBelongToProject({ publisher_org_id: null, brand_org_id: null, agency_org_id: null }, PROJECT), true);
});

test("second project publisher is still consistent (intended multi-publisher project)", () => {
  const c: CampaignOrgFks = { publisher_org_id: "pub-2", brand_org_id: "brand-1", agency_org_id: "agency-1" };
  assert.equal(campaignOrgsBelongToProject(c, PROJECT), true);
});

// ── Decision core (authorisation + invariant + fail-closed) ──────────────────

const sameOrg: CampaignOrgFks = { publisher_org_id: "pub-1", brand_org_id: "brand-1", agency_org_id: null };
const crossOrg: CampaignOrgFks = { publisher_org_id: "pub-X", brand_org_id: null, agency_org_id: null };

test("valid same-organisation association by an authorised publisher → permitted", () => {
  assert.deepEqual(evaluateCampaignProjectAssociation("publisher", PROJECT, true, sameOrg), { ok: true });
});

test("unauthorised project (publisher cannot access) → refused 403", () => {
  const r = evaluateCampaignProjectAssociation("publisher", PROJECT, false, sameOrg);
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 403);
});

test("cross-organisation association is refused even for an authorised actor → 403", () => {
  const r = evaluateCampaignProjectAssociation("publisher", PROJECT, true, crossOrg);
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 403);
});

test("ADMIN bypasses authorisation but NOT the cross-org invariant → 403", () => {
  const r = evaluateCampaignProjectAssociation("admin", PROJECT, true, crossOrg);
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 403);
});

test("admin same-organisation association → permitted", () => {
  assert.deepEqual(evaluateCampaignProjectAssociation("admin", PROJECT, true, sameOrg), { ok: true });
});

test("invalid / missing / deleted project reference → fail closed 400", () => {
  const r = evaluateCampaignProjectAssociation("admin", null, true, sameOrg);
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 400);
});

test("cascade-exposure prevention: an org-X campaign can never be associated with an org-Y project", () => {
  // The org-Y project (no shared org with the campaign) — the exact F040 case.
  const orgYProject: ProjectOrgs = { brand_org_id: "brand-Y", agency_org_id: "agency-Y", publisher_org_ids: ["pub-Y"] };
  const orgXCampaign: CampaignOrgFks = { publisher_org_id: "pub-X", brand_org_id: "brand-X", agency_org_id: null };
  // Even an admin (authorised) is refused, so the association cannot be written,
  // so the selected-access cascade can never surface it to org Y.
  const r = evaluateCampaignProjectAssociation("admin", orgYProject, true, orgXCampaign);
  assert.equal(r.ok, false);
});
